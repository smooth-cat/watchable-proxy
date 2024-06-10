import { PrivateKeys, afterSetFns, watchMap } from "./var";

export const getType = a => {
  return Object.prototype.toString.call(a).slice(8, -1);
};

export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const isObject = val => val !== null && typeof val === 'object';

export const isObservable = val => isObject(val) && Boolean(val[PrivateKeys.__$_isObservableObj]);

/** 增删改时触发向上回溯所有父代理对象，触发对应 watcher */
export function loopParent(paths, parent, oldVal, newVal, type, walkedParent = new Set()) {
  // 处理该 parent 节点

  const watchSet = watchMap.get(parent) || new Set();
  const isWatched = watchSet.size > 0;
  if (isWatched) {
    watchSet.forEach(fn => {
      const afterSetFn = fn({ path: paths.join('.'), paths: [...paths], oldVal, newVal, type });
      if (typeof afterSetFn === 'function') {
        // TODO: 考虑嵌套 set 顺序问题，如 ASet 触发 A1 A2 回调，A1 触发 BSet， B1 回调需要等到 A2 执行完成后才会被执行
        afterSetFns.push(afterSetFn);
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
