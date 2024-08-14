import { SyncQueue } from "./sync-queue";

export const PrivateKeys = {
  __$_isObservableObj: '__$_isObservableObj',
  __$_parents: '__$_parents',
  __$_raw: '__$_raw'
};

export enum OprType {
  ADD = 'ADD',
  SET = 'SET',
  DEL = 'DEL',
  GET = 'GET',
}

export const BATCH = '__$_batch' as const;

export const targetToProxy = new WeakMap();

/** key 被监听的对象，value 监听函数 set */
export const watchMap = new WeakMap<object, Set<Function>>();
/** 同上但是是监听的是 getter */
export const getterWatchMap = new WeakMap<object, Set<Function>>();


const globalVar = {
  /** 在 setter 阶段禁止 getter 的监听 */
  banWatchGet: false,
  enableGet: false,
}

type Key = keyof typeof globalVar

export const getVar = (key: Key) => globalVar[key];
export const setVar = (key: Key, value: any) => globalVar[key] = value;

/** @deprecated */
export const afterSetFns = new SyncQueue();