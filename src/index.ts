const PrivateKeys = {
  __isObservableObj: '__isObservableObj',
  __parent: '__parent',
  __key: '__key'
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

export const watchable = <T>(target: T, belongInfo = {}): T => {
  // target 就是代理对象
  if (target[PrivateKeys.__isObservableObj]) {
    return target;
  }

  // target 已有代理对象则返回
  const existingProxy = targetToProxy.get(target as any);
  if (existingProxy) {
    return existingProxy;
  }

  const __private = {
    __isObservableObj: true,
    __parent: null,
    __key: '',
    ...belongInfo
  };

  const set = createSetter(__private);
  const get = createGetter(__private);

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
const createSetter = __private => {
  return function (target, key, value, receiver) {
    // 如果 value 是 proxy 那么 parent 和 key 将修正为 receiver 和 key，在变成 proxy 后又被赋值到其他属性时，__parent 指向最新的 parent
    if (isObject(value) && value[PrivateKeys.__isObservableObj]) {
      value.__private.__parent = receiver;
      value.__private.__key = key;
    }
    const oldVal = target[key];
    const type = hasOwn(target, key) ? OprType.SET : OprType.ADD;
    loopParent(key, receiver, oldVal, value, type);
    // console.log('set', { target, key, value, receiver });
    return Reflect.set(target, key, value, receiver);
  };
};

/** 增删改时触发向上回溯所有父代理对象，触发对应 watcher */
function loopParent(key, parent, oldVal, newVal, type) {
  const paths = [key];
  while (1) {
    // 查找被监听的根对象
    const watchSet = watchMap.get(parent) || new Set();
    const isWatched = watchSet.size > 0;
    if (isWatched) {
      watchSet.forEach(fn => {
        const rPaths = [...paths].reverse();
        fn({ path: rPaths.join('.'), paths: rPaths, oldVal, newVal, type });
      });
    }
    const nextP = parent[PrivateKeys.__parent];
    const nextK = parent[PrivateKeys.__key];
    //  不存在下一个 parent 就结束
    if (!nextP) break;
    // 存在则继续
    paths.push(nextK);
    parent = nextP;
  }
  return paths.reverse();
}
/*------------------------ getter ------------------------*/
// 递归创建 getter 时从 observable 传过来的 父代理对象 receiver
const createGetter = __private => {
  return function (target, key, receiver) {
    // console.log('get', { target, key, receiver });

    if (key === '__private') {
      return __private;
    }

    const isPrivateKey = Object.keys(PrivateKeys).includes(key);
    if (isPrivateKey) {
      return __private[key];
    }

    const value = Reflect.get(target, key, receiver);

    // 值还是一个对象就返回一个代理对象, receiver 代表父代理对象
    if (isObject(value)) {
      return watchable(value, { __parent: receiver, __key: key });
    }
    return value;
  };
};
/*------------------------ delete ------------------------*/
function deleteProperty(target, key) {
  // console.log('delete', { target, key });
  const parent = targetToProxy.get(target);
  loopParent(key, parent, target[key], undefined, OprType.DEL);
  return Reflect.deleteProperty(target, key);
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

// const p = watchable({
//   a: {
//     b: {
//       c: 10,
//       d: 20,
//     },
//   },
// });

// watch(p, 'a.b.*', (props) => {
//   console.log('a.b.c发生变化', props);
// })
// p.a.b.c = 2
