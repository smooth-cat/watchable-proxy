import { watchable } from './index';
import { getType, isObservable } from './util';

export function getTypes(value: any) {
  const type = getType(value);
  const isArray = type === 'Array';
  const isFunction = type === 'Function';
  const isBasic = ['Number', 'String', 'Undefined', 'Null'].includes(type);
  const canIterate = !isBasic && !isFunction;
  return {
    type,
    isArray,
    isFunction,
    isBasic,
    canIterate
  };
}

export type ITypes = ReturnType<typeof getTypes>;

export function clone<T>(value: T): T {
  const { isBasic, isArray, canIterate } = getTypes(value);

  if (isBasic) {
    return value;
  }

  if (isArray) {
    return [...(value as any)] as T;
  }

  if (canIterate && !isArray) {
    return { ...value };
  }
}

export type ICloneDeepWithCallback = (value: any, types: ITypes, key?: any, parent?: any) => any;

const ClonedPlaceholder = 1;
export function cloneDeepWith<T>(
  value: T,
  cb?: ICloneDeepWithCallback,
  key?: any,
  parent?: any,
  clonedMap?: WatchableWeakMap
): T {
  const isTop = !clonedMap;
  clonedMap = clonedMap || new WatchableWeakMap();
  const types = getTypes(value);
  const { canIterate, isBasic, isFunction, isArray } = types;
  if (cb) {
    value = cb(value, types, key, parent);
  }
  // 递归出口
  if (isBasic || isFunction) {
    return value;
  }
  // 克隆过的返回克隆的对象
  if (clonedMap.has(value)) {
    const cloned = clonedMap.get(value);

    function layBack() {
      this[key] = clonedMap.get(value);
    }
    layBack.__0_isLayBack = true;
    layBack.__0_value = value;
    return cloned === ClonedPlaceholder ? layBack : clonedMap.get(value);
  }

  function handleLayBack(clonedParent: any, key: any) {
    const res = clonedParent[key];
    // 确保 this 正确
    if (typeof res === 'function' && res.__0_isLayBack) {
      clonedMap.watch(res.__0_value, () => {
        clonedParent[key]();
      });
    }
  }

  // 数组
  if (isArray) {
    clonedMap.set(value, ClonedPlaceholder);
    const clonedArray = [];
    (value as Array<any>).forEach((it, i) => {
      const res = cloneDeepWith(it, cb, i, value, clonedMap);
      clonedArray[i] = res;
      handleLayBack(clonedArray, i);
    });

    clonedMap.set(value, clonedArray);
    // 是 top 要把引用的函数清空避免内存溢出
    if (isTop) {
      clonedMap.clear();
    }
    return clonedArray as T;
  }

  // 对象
  if (canIterate) {
    try {
      const clonedObject: any = {};
      clonedMap.set(value, ClonedPlaceholder);
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const res = cloneDeepWith(value[key], cb, key, value, clonedMap);
          clonedObject[key] = res;
          handleLayBack(clonedObject, key);
        }
      }
      clonedMap.set(value, clonedObject);
      // 是 top 要把引用的函数清空避免内存溢出
      if (isTop) {
        clonedMap.clear();
      }
      return clonedObject;
    } catch (error) {
      console.warn('clone fail, will return same object', value);
      return value;
    }
  }
}

class WatchableWeakMap extends WeakMap<any, any> {
  set(key: any, value: any) {
    const res = super.set(key, value);
    const fns = this.fns.get(key);
    // clone 完成，通知改为真实克隆的值
    if (value !== ClonedPlaceholder && fns?.length) {
      fns.forEach(v => v());
    }
    return res;
  }
  fns = new Map<any, Function[]>();
  watch(key: any, callback: Function) {
    const arr = this.fns.get(key) || [];
    arr.push(callback);
    this.fns.set(key, arr);
  }

  clear() {
    this.fns.clear();
  }
}

export const useCloneWatchable = (watchable) => {
  const cloneWatchable = <T>(proxy: T, cb?: ICloneDeepWithCallback) => {
    const res = cloneDeepWith(proxy, (value: any, types: any, key?: any, parent?: any) => {
  
      value = isObservable(value) ? value.__$_raw : value;
  
      return cb ? cb(value, types, key, parent) : value;
    });
    return watchable(res) ;
  };

  return cloneWatchable;
}

export const cloneRaw = <T>(proxy: T) => {
  return cloneDeepWith(proxy, (v) => isObservable(v) ? v.__$_raw : v);
}

// const a: any = {
//   b: 10,
//   c: {e:[]},
//   d: [],
// }

// a.self = a;

// const cloned = cloneDeepWith(a)
// console.log(cloned.self);
// console.log(cloned.self === a);
// console.log(cloned.c === a.c);
// console.log(cloned.c.e === a.c.e);
// console.log(cloned.d === a.d);
