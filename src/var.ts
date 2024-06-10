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
}

export const BATCH = '__$_batch' as const;

export const targetToProxy = new WeakMap();

/** key 被监听的对象，value 监听函数 set */
export const watchMap = new WeakMap<object, Set<Function>>();

/** @deprecated */
export const afterSetFns = new SyncQueue();