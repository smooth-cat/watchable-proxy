import { OprType, PrivateKeys, afterSetFns, getterWatchMap, watchMap } from "./var";

export const getType = a => {
  return Object.prototype.toString.call(a).slice(8, -1);
};

export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const isObject = val => val !== null && typeof val === 'object';

export const isObservable = val => isObject(val) && Boolean(val[PrivateKeys.__$_isObservableObj]);

/** 
 * TODO: 解决性能优化问题，如何快速在图中找到当前 proxy 到达 proxy 监听列表中 每个点的路径，这样比漫无目的的逐层向上寻找来得简单
 * 增删改时触发向上回溯所有父代理对象，触发对应 watcher */
export function loopParent(paths, parent, oldVal, newVal, type, target, info: any, walkedParent = new Set()) {
  // 处理该 parent 节点
  const map = type !== OprType.GET ? watchMap : getterWatchMap;
  const watchSet = map.get(parent) || new Set();
  const isWatched = watchSet.size > 0;
  if (isWatched) {
    watchSet.forEach(fn => {
      const afterSetFn = fn({ path: paths.join('.'), paths: [...paths], oldVal, newVal, type, target, info });
      if (typeof afterSetFn === 'function') {
        afterSetFns.push(afterSetFn);
      }
    });
  }

  walkedParent.add(parent);

  // 获取需要处理的 grandParent 节点
  const grandParents = parent[PrivateKeys.__$_parents].filter(it => !walkedParent.has(it.parent));
  if (grandParents.length) {
    grandParents.forEach(({ key, parent }) => {
      loopParent([key, ...paths], parent, oldVal, newVal, type, target, info, walkedParent);
    });
  }

  // 递归完成后清除 set 避免内存溢出
  if (paths.length === 1) {
    walkedParent.clear();
  }
}
/** length 尽量大于 16 */ 
export function randomStr(length: number) {
  const timestamp = Date.now().toString(36);
  const randomNumber = Math.floor(Math.random() * Math.pow(10, 14));
  return `${timestamp}${randomNumber}`.slice(0, length);
}

 export class AutoClearMap<K,V> extends Map<K,V> {
  maxSize = 40;
  set(k: K, v:V) {
    // 如果超过了那每次 set 都需要从原来的去掉
    if(this.size === this.maxSize) {
      const { value: key } = this.keys().next();
      this.delete(key);
    }
    return super.set(k,v);
  }
 }
