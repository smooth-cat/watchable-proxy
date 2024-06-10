import { DeepExtendArray, createArrayMethods } from './array-methods';
import { batchMap, batchSet } from './batch-action';
import { useCloneWatchable } from './clone';
import { getType, hasOwn, isObject, isObservable, loopParent } from './util';
import { BATCH, OprType, PrivateKeys, afterSetFns, targetToProxy, watchMap } from './var';
export { cloneRaw } from './clone';
export { batchSet, BatchOpt, IBatchSetOption, IBatchCtx } from './batch-action';
export { BATCH } from './var';

const arrayMethods = createArrayMethods();

export const watchable = <T>(target: T, belongInfo?: any): DeepExtendArray<T> => {
  // target 就是代理对象
  if (target[PrivateKeys.__$_isObservableObj]) {
    return target as any;
  }

  // target 已有代理对象则返回
  // TODO: 这里注意如果使用 extendsArray 需要
  const existingProxy = targetToProxy.get(target as any);
  if (existingProxy) {
    return existingProxy;
  }

  const __$_private = {
    isObservableObj: true,
    parents: [],
    raw: target
  };
  if (belongInfo) {
    __$_private.parents.push(belongInfo);
  }

  const set = createSetter(__$_private);
  const get = createGetter(__$_private);

  if (Array.isArray(target)) {
    // 绑定原对象后，会通过 get 方法时会将 this 绑定到 proxy 对象，这里不用当心
    Object.assign(target, arrayMethods);
  }

  const proxy = new Proxy(target, {
    set,
    get,
    deleteProperty
  });

  // 原对象 -> 代理对象
  targetToProxy.set(target as any, proxy);

  return proxy as any;
};
/*------------------------ setter ------------------------*/
const createSetter = __$_private => {
  return function (target, key, rawValue, receiver) {
    const action = SetAction.is(rawValue) ? rawValue : null;
    const value = action ? action.value : rawValue;

    // 非 withoutWatchTrain 则需要收集 parent
    if (isObservable(value) && !action?.withoutWatchTrain) {
      value.__$_private.parents.push({
        parent: receiver,
        key
      });
    }

    const oldValProxy = receiver[key];
    // 如果原 value 是属于 本代理对象 的 子代理对象，但新值不是该子代理对象，则说明 子代理对象已经不再处于父对象的监听范围之内，其 parent 移除
    if (isObservable(oldValProxy)) {
      const foundReceiverIndex = oldValProxy.__$_private.parents.find(it => it.key === key && it.parent === receiver);
      if (foundReceiverIndex !== -1 && value !== oldValProxy) {
        oldValProxy.__$_private.parents.splice(foundReceiverIndex, 1);
      }
    }

    const oldVal = target[key];
    const type = hasOwn(target, key) ? OprType.SET : OprType.ADD;

    // 优先考虑 action 再考虑 batch
    const triggerWatcher = action ? !action.noTriggerWatcher : batchMap.shouldTriggerSingleWatcher(receiver);
    if (triggerWatcher) {
      loopParent([key], receiver, oldVal, value, type);
    }
    const res = Reflect.set(target, key, value, receiver);
    // 不触发 loopParent 收集回调，那么也对应不触发回调函数的执行
    if (triggerWatcher) {
      afterSetFns.exec();
    }
    // console.log('set', { target, key, value, receiver });
    return res;
  };
};

/*------------------------ getter ------------------------*/
// 递归创建 getter 时从 observable 传过来的 父代理对象 receiver
const createGetter = __$_private => {
  return function (target, key, receiver) {
    // console.log('get', { target, key, receiver });

    if (key === '__$_private') {
      return __$_private;
    }

    const isPrivateKey = Object.keys(PrivateKeys).includes(key);
    if (isPrivateKey) {
      return __$_private[key.slice(4)];
    }

    const value = Reflect.get(target, key, receiver);

    if (typeof value === 'function') {
      return createRewriteFn(target, key, value, receiver);
    }

    // 值还是一个对象就返回一个代理对象, receiver 代表父代理对象
    if (isObject(value)) {
      const childProxy = watchable(value, { parent: receiver, key });
      batchMap.trackProxy(childProxy, receiver);
      return childProxy;
    }

    return value;
  };
};

const createRewriteFn = (target, key, value, receiver) => {
  function fn(...args) {
    // 数组对象任然使用 receiver 来保证数组项的监听没有问题
    if (Array.isArray(target)) {
      return value.call(receiver, ...args);
    }
    // 使用 bind 后
    else if (fn['_this']) {
      return Function.prototype.call.call(target[key], fn['_this'], ...args);
    }
    // 其他 class 生成的对象则使用 target 直接调用的方式来实现
    else {
      return target[key](...args);
    }
  }

  fn.call = (thisArg: any, ...args: any[]) => {
    return Function.prototype.call.call(target[key], thisArg, ...args);
  };

  fn.apply = (thisArg: any, args: any[]) => {
    return Function.prototype.apply.call(target[key], thisArg, args);
  };

  fn.bind = (thisArg: any) => {
    fn['_this'] = thisArg;
    return fn;
  };

  return fn;
};

/*------------------------ delete ------------------------*/
function deleteProperty(target, key) {
  // console.log('delete', { target, key });

  const receiver = targetToProxy.get(target);

  const oldValProxy = receiver[key];
  // 如果原 value 是属于 本代理对象 的 子代理对象，则使用 delete 关键字会让其不再属于 父对象的监听范围
  if (isObservable(oldValProxy)) {
    const foundReceiverIndex = oldValProxy.__$_private.parents.find(it => it.key === key && it.parent === receiver);
    if (foundReceiverIndex !== -1) {
      oldValProxy.__$_private.parents.splice(foundReceiverIndex, 1);
    }
  }
  // 消费 map 中的 action
  const action = deleteActionMap.getAction(receiver, key);
  deleteActionMap.delAction(receiver, key);

  // 优先考虑 action 再考虑 batch
  const triggerWatcher = action ? !action.noTriggerWatcher : batchMap.shouldTriggerSingleWatcher(receiver);
  if (triggerWatcher) {
    loopParent([key], receiver, target[key], undefined, OprType.DEL);
  }
  const res = Reflect.deleteProperty(target, key);
  if (triggerWatcher) {
    afterSetFns.exec();
  }
  return res;
}

/*----------------- watch Api -----------------*/
export type IWatchCallback = (
  props: {
    path: string;
    paths: string[];
    oldVal: any;
    newVal: any;
    type: OprType | string;
    matchedIndex: number;
    matchedRule: string | RegExp;
  },
  dispose: () => void
) => any;
export interface IWatch {
  <T extends object>(watchableObj: T, callback: IWatchCallback): () => void;
  <T extends object>(
    watchableObj: T,
    cond: string | RegExp | (string | RegExp)[],
    callback: IWatchCallback
  ): () => void;
}

const _watch = (watchableObj, p1, p2) => {
  const p1Type = getType(p1);
  let cond;
  let fn;
  switch (p1Type) {
    case 'String':
    case 'RegExp':
      cond = [p1];
      fn = p2;
      break;
    case 'Array':
      cond = p1;
      fn = p2;
      break;
    case 'Function':
      fn = p1;
      break;
  }

  const watchSet = watchMap.get(watchableObj) || new Set();
  watchMap.set(watchableObj, watchSet);
  // 取消订阅的方法
  const dispose = () => {
    watchSet.delete(wrappedFn);
  };

  function isFuzzyMatchBatch(keys, paths) {
    // 正则转str后的字符串是 '\\$', 对应的正则匹配是 /\\ \\ \$/
    const lastKey = keys[keys.length - 1];
    const lastPath = paths[paths.length - 1];
    // __$_batch 不可被模糊匹配
    return lastKey !== BATCH && lastKey !== '__\\$_batch' && lastPath === BATCH;
  }

  const wrappedFn = props => {
    const { path, paths } = props;
    // 不存在则对象任何属性变化都会触发
    if (!cond) {
      return fn(props, dispose);
    }

    const matchedIndex: number = cond.findIndex(it => {
      // 正则则直接匹配即可
      if (getType(it) === 'RegExp') {
        const keys = it.source.split('\\.');
        if (isFuzzyMatchBatch(keys, paths)) {
          return false;
        }
        return it.test(path);
      }
      /**
       * 字符串则挨个匹配，规则如下
       * 1. 字符和数字都精确匹配,
       * 2. * 表示任意属性
       * 3. *n 表示任意数字
       * 4. ** 表示后面的都随机
       */
      const keys = it.split('.');

      if (isFuzzyMatchBatch(keys, paths)) {
        return false;
      }

      const regExpStr = keys
        .reduce((str, key) => {
          // 避免带 $ 符号的 key 转正则是匹配失败
          key = key.replace(/\$/g, '\\$');
          let currStr = key === '*' ? '[a-zA-Z0-9_$]+' : key === '*n' ? '\\d+' : key === '**' ? '.+' : key;
          return str + currStr + '\\.';
        }, '')
        .slice(0, -2);
      const regExp = new RegExp('^' + regExpStr + '$');
      return regExp.test(path);
    });

    if (matchedIndex !== -1) {
      const matchedRule = cond[matchedIndex];
      // 校对是否符合条件
      return fn({ ...props, matchedIndex, matchedRule }, dispose);
    }
  };

  watchSet.add(wrappedFn);

  return dispose;
};
export const watch: IWatch = _watch as any;

/*----------------- setProp Api -----------------*/
const DefaultPureRefOpt = {
  noTriggerWatcher: false,
  withoutWatchTrain: false
};
type IPureRefOpt = Partial<typeof DefaultPureRefOpt>;
export function setProp<T>(proxy: T, key: string | number, value: any, opt: IPureRefOpt = {}) {
  opt = { ...DefaultPureRefOpt, ...opt };
  const action = new SetAction(value, opt);
  proxy[key] = action;

  return true;
}
class SetAction {
  static is = (v: any) => v instanceof SetAction;
  value: any;
  constructor(value, opt) {
    for (const key in opt) {
      this[key] = opt[key];
    }

    // 非对象则直接让 value 等于原始值
    if (!isObject(value)) {
      this.value = value;
      return;
    }

    const valueIsWatchable = isObservable(value);
    const existingProxy = targetToProxy.get(value);

    // 这里需要主动把非 proxy 转为 proxy 不然在 get 时转换会出现赋值 parent 的情况
    const proxyValue = valueIsWatchable ? value : existingProxy ?? watchable(value);
    this.value = proxyValue;
  }
}
/*----------------- deleteProp Api -----------------*/
const DefaultDeletePropOpt = {
  noTriggerWatcher: false
};
type IDeletePropAction = Partial<typeof DefaultDeletePropOpt>;

export function deleteProp<T extends object>(proxy: T, key: string | number, opt: IDeletePropAction = {}) {
  opt = { ...DefaultDeletePropOpt, ...opt };
  // 生产
  deleteActionMap.setAction(proxy, key, opt);
  delete proxy[key];
}

class DeleteActionMap extends WeakMap<any, Map<any, IDeletePropAction>> {
  getAction(proxy, key) {
    key = String(key);
    const map = this.get(proxy);
    return map?.get(key);
  }

  setAction(proxy, key, action) {
    key = String(key);
    const keyMap = this.get(proxy) || new Map();
    keyMap.set(key, action);
    this.set(proxy, keyMap);
  }

  delAction(proxy, key) {
    key = String(key);
    this.get(proxy)?.delete(key);
  }
}

const deleteActionMap = new DeleteActionMap();

/*----------------- Scope Api -----------------*/
export class Scope {
  watch: IWatch = ((...args: any[]) => {
    if (this.disabled) return () => {};
    // @ts-ignore
    const dispose = _watch(...args);
    this.disposes.push(dispose);
    return dispose;
  }) as any;

  disabled = false;

  private disposes: Function[] = [];

  /** dispose current watchers */
  dispose() {
    this.disposes.forEach(v => v());
    this.disposes = [];
  }

  /** dispose current watchers and make subsequent watcher invalid */
  destroy() {
    this.dispose();
    this.disabled = true;
  }
}

export const cloneWatchable = useCloneWatchable(watchable);
