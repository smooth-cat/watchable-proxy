const PrivateKeys = {
  __$_isObservableObj: '__$_isObservableObj',
  __$_parents: '__$_parents'
};

export enum OprType {
  ADD = 'ADD',
  SET = 'SET',
  DEL = 'DEL'
}

const getType = a => {
  return Object.prototype.toString.call(a).slice(8, -1);
};

export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const targetToProxy = new WeakMap();

const isObject = val => val !== null && typeof val === 'object';
const isObservable = val => isObject(val) && val[PrivateKeys.__$_isObservableObj];
export const watchable = <T>(target: T, belongInfo?: any): T => {
  // target 就是代理对象
  if (target[PrivateKeys.__$_isObservableObj]) {
    return target;
  }

  // target 已有代理对象则返回
  const existingProxy = targetToProxy.get(target as any);
  if (existingProxy) {
    return existingProxy;
  }

  const __$_private = {
    isObservableObj: true,
    parents: []
  };
  if (belongInfo) {
    __$_private.parents.push(belongInfo);
  }

  const set = createSetter(__$_private);
  const get = createGetter(__$_private);

  const proxy = new Proxy(target, {
    set,
    get,
    deleteProperty
  });

  // 原对象 -> 代理对象
  targetToProxy.set(target as any, proxy);

  return proxy as T;
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
      const foundReceiverIndex = oldValProxy.__$_private.parents.find(it => it.parent === receiver);
      if (foundReceiverIndex !== -1 && value !== oldValProxy) {
        oldValProxy.__$_private.parents.splice(foundReceiverIndex, 1);
      }
    }

    const oldVal = target[key];
    const type = hasOwn(target, key) ? OprType.SET : OprType.ADD;
    if (!action?.noTriggerWatcher) {
      loopParent([key], receiver, oldVal, value, type);
    }
    const res = Reflect.set(target, key, value, receiver);
    afterSetFns.forEach(v => v());
    afterSetFns.clear();
    // console.log('set', { target, key, value, receiver });
    return res;
  };
};

const afterSetFns = new Set<Function>();
/** 增删改时触发向上回溯所有父代理对象，触发对应 watcher */
function loopParent(paths, parent, oldVal, newVal, type, walkedParent = new Set()) {
  // 处理该 parent 节点

  const watchSet = watchMap.get(parent) || new Set();
  const isWatched = watchSet.size > 0;
  if (isWatched) {
    watchSet.forEach(fn => {
      const afterSetFn = fn({ path: paths.join('.'), paths: [...paths], oldVal, newVal, type });
      if (getType(afterSetFn) === 'Function') {
        afterSetFns.add(afterSetFn);
      }
    });
  }

  walkedParent.add(parent);

  // 获取需要处理的 grandParent 节点
  const grandParents = parent[PrivateKeys.__$_parents].filter(it => !walkedParent.has(it.parent));
  if (grandParents.length) {
    grandParents.forEach(({ key, parent }) => {
      loopParent([key, ...paths], parent, oldVal, newVal, type, walkedParent);
    });
  }

  // 递归完成后清除 set 避免内存溢出
  if (paths.length === 1) {
    walkedParent.clear();
  }
}
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


    if(typeof value === 'function') {    
      return createRewriteFn(target, key, value, receiver);
    }

    // 值还是一个对象就返回一个代理对象, receiver 代表父代理对象
    if (isObject(value)) {
      return watchable(value, { parent: receiver, key });
    }



    return value;
  };
};

const createRewriteFn = (target, key, value, receiver) => {

  function fn(...args) {
        
    // 数组对象任然使用 receiver 来保证数组项的监听没有问题 
    if(Array.isArray(target)) {
      return value.call(receiver, ...args);
    } 
    // 使用 bind 后
    else if(fn['_this']) {
      return Function.prototype.call.call(target[key], fn['_this'], ...args);
    }
    // 其他 class 生成的对象则使用 target 直接调用的方式来实现
    else {
      return target[key](...args);
    }
  }

  fn.call = (thisArg: any, ...args: any[]) => {
    return Function.prototype.call.call(target[key], thisArg, ...args);
  }

  fn.apply = (thisArg: any, args: any[]) => {
    return Function.prototype.apply.call(target[key], thisArg, args);
  }

  fn.bind = (thisArg: any) => {
    fn['_this'] = thisArg;
    return fn;
  }

  return fn;
}

/*------------------------ delete ------------------------*/
function deleteProperty(target, key) {
  // console.log('delete', { target, key });

  const receiver = targetToProxy.get(target);

  const oldValProxy = receiver[key];
  // 如果原 value 是属于 本代理对象 的 子代理对象，则使用 delete 关键字会让其不再属于 父对象的监听范围
  if (isObservable(oldValProxy)) {
    const foundReceiverIndex = oldValProxy.__$_private.parents.find(it => it.parent === receiver);
    if (foundReceiverIndex !== -1) {
      oldValProxy.__$_private.parents.splice(foundReceiverIndex, 1);
    }
  }

  loopParent([key], receiver, target[key], undefined, OprType.DEL);
  const res = Reflect.deleteProperty(target, key);
  afterSetFns.forEach(v => v());
  afterSetFns.clear();
  return res;
}

/** key 被监听的对象，value 监听函数 set */
export const watchMap = new WeakMap();
export type IWatchCallback = (
  props: {
    path: string;
    paths: string[];
    oldVal: any;
    newVal: any;
    type: OprType;
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

  const wrappedFn = props => {
    const { path } = props;
    // 不存在则对象任何属性变化都会触发
    if (!cond) {
      return fn(props, dispose);
    }

    const matchedIndex: number = cond.findIndex(it => {
      // 正则则直接匹配即可
      if (getType(it) === 'RegExp') {
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
      const regExpStr = keys
        .reduce((str, key) => {
          let currStr = key === '*' ? '[a-zA-Z0-9_$]+' : key === '*n' ? '\\d+' : key === '**' ? '.+' : key;
          return str + currStr + '\\.';
        }, '')
        .slice(0, -2);
      const regExp = new RegExp(regExpStr);
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

const DefaultPureRefOpt = {
  noTriggerWatcher: false,
  withoutWatchTrain: false
};
type IPureRefOpt = Partial<typeof DefaultPureRefOpt>;

// TODO: 兼容非 Object 情况
export const setProp = <T>(proxy: T, key: string | number, value: any, opt: IPureRefOpt = {}) => {
  opt = { ...DefaultPureRefOpt, ...opt };
  const action = new SetAction(value, opt);
  proxy[key] = action;

  return true;
};

class SetAction {
  static is = (v: any) => v instanceof SetAction;
  value: any;
  constructor(value, opt) {
    // 非对象则直接让 value 等于原始值
    if (!isObject(value)) {
      this.value = value;
      return;
    }

    for (const key in opt) {
      this[key] = opt[key]
    }

    const valueIsWatchable = isObservable(value);
    const existingProxy = targetToProxy.get(value);

    // 这里需要主动把非 proxy 转为 proxy 不然在 get 时转换会出现赋值 parent 的情况
    const proxyValue = valueIsWatchable ? value : existingProxy ?? watchable(value);
    this.value = proxyValue;
  }
}

// const a: any = {
//   b: {
//     c: {},
//     d: 'd'
//   }
// };
// const aProxy = watchable<any>(a);
// // 使用 pureRef 避免循环引用的对象的 父对象触发 watcher
// setProp(aProxy.b.c, 'a', aProxy, {
//   withoutWatchTrain: true
// });
// watch(aProxy, props => {
//   console.log('aProxy', props);
// });

// // 使用赋值方式后
// const cTemp = aProxy.b.c;
// watch(cTemp, props => {
//   console.log('cTemp', props);
// });

// aProxy.b.d = 'joker';
