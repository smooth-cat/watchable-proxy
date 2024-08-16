// 使用后，对应 proxy 下的操作(set delete) 都由 manager 管理，

import { clone, cloneDeepWith } from './clone';
import { AutoClearMap, isObservable, loopParent, randomStr } from './util';
import { BATCH, afterSetFns, targetToProxy } from './var';

// manager 通过 get 方法收集所有子 proxy ，来判断 set 是否属于该 批处理操作
export type IBatchSetOption = {
  triggerTarget?: 'method' | 'setter' | 'both';
  needDeepClone?: boolean;
  batchName?: string;
  proxies?: any[];
  ignoreUpperCtx?: boolean;
};

const DefaultBatchSetOption: IBatchSetOption = {
  triggerTarget: 'method',
  needDeepClone: false,
  proxies: [],
  ignoreUpperCtx: false
};

class BatchMap extends WeakMap<IBatchCtx, Set<any[]>> {
  batchCallStack: IBatchCtx[] = [];

  public get currentBatch(): IBatchCtx | undefined {
    return this.batchCallStack[this.batchCallStack.length - 1];
  }

  ctxFlag = '';

  ctxFlagToEffectiveCtx = new AutoClearMap<string, IBatchCtx>();

  batchStart(ctx: IBatchCtx) {
    this.batchCallStack.push(ctx);
    this.ctxFlag += ctx.id;
  }

  batchFinish() {
    const ctx = this.currentBatch;
    batchMap.delete(ctx);
    batchMap.batchCallStack.pop();
    this.ctxFlag = this.ctxFlag.slice(0, -20);
  }

  shouldTriggerSingleWatcher(proxy: any) {
    const ctx = this.findEffectiveCtx();
    // 不存在正在执行的 batch 则正常触发 setter
    if (!ctx) return true;
    // 1. proxy 不属于 batch 范围则 仍然触发 setter
    // 2. proxy 在 batch 范围， 但 batch 设置了 setter 可触发
    const proxyInBatch = this.get(ctx)?.has(proxy);
    const shouldTriggerSetter = ctx.triggerTarget === 'both' || ctx.triggerTarget === 'setter';
    return !proxyInBatch || shouldTriggerSetter;
  }

  trackProxy(proxy: any, parent?: any) {
    const ctx = this.findEffectiveCtx();
    if (!ctx) return;
    const proxySet = this.get(ctx) || new Set();
    // parent 不存在说明是 函数刚执行时 proxy 的收集
    if (!parent || proxySet.has(parent)) {
      proxySet.add(proxy);
    }
    this.set(ctx, proxySet);
  }

  findEffectiveCtx() {
    // memo 化，如果 ctx 编号相同的话就不需要再做循环查找了，直接使用现成结果即可
    if (this.ctxFlagToEffectiveCtx.has(this.ctxFlag)) {
      return this.ctxFlagToEffectiveCtx.get(this.ctxFlag);
    }
    // 优化逻辑
    if (this.batchCallStack.length === 1) {
      this.ctxFlagToEffectiveCtx.set(this.ctxFlag, this.batchCallStack[0]);
      return this.batchCallStack[0];
    }

    const lastI = this.batchCallStack.length - 1;
    let j = lastI;
    for (let i = lastI; i >= 0; i--) {
      const ctx = this.batchCallStack[i];
      // 一个个往前试探，碰到 findEffectiveCtx 停下或直到遍历完成
      j = i;
      if (ctx.ignoreUpperCtx) {
        break;
      }
    }
    const effectiveCtx = this.batchCallStack[j];
    this.ctxFlagToEffectiveCtx.set(this.ctxFlag, effectiveCtx);
    return effectiveCtx;
  }
}

export const batchMap = new BatchMap();

export type IBatchCtx = {
  function: Function;
  args: any[];
  id: string;
} & IBatchSetOption;

class _BatchOpt implements IBatchSetOption {
  constructor(props: _BatchOpt) {
    for (const key in props) {
      this[key] = props[key];
    }
  }
}

export function BatchOpt(props: IBatchSetOption) {
  return new _BatchOpt(props);
}

/** 获取重载函数的 parameter 只会获取最后一个，为了兼容其他重载，则补充 ...args any[] 来保证运行正确 */
type ExtendedOverload<T extends (...args) => any> = {
  (...args: Parameters<T>): ReturnType<T>;
  (...args: any[]): any;
};

export type ExtendedBatchFunction<T extends (...args) => any> = {
  // @ts-ignore
  (...args: [...Parameters<T>, opt?: IBatchSetOption]): ReturnType<T>;
  (...args: any[]): any;
};

export function batchSet<T extends (...args) => any>(
  fn: T,
  initialOpt: IBatchSetOption = {}
): ExtendedBatchFunction<T> {
  return function (...args: any[]) {
    let opt = args[args.length - 1];
    const hasCustomerOpt = opt instanceof _BatchOpt;
    if (hasCustomerOpt) {
      opt = { ...DefaultBatchSetOption, ...initialOpt, ...opt };
      args = args.slice(0, -1);
    } else {
      opt = { ...DefaultBatchSetOption, ...initialOpt };
    }
    const proxies = opt.proxies;

    const ctx: IBatchCtx = {
      function: fn,
      args: args,
      id: randomStr(20),
      ...opt
    };

    batchMap.batchStart(ctx);

    const effectiveCtx = batchMap.findEffectiveCtx();
    const isUpperCtx = effectiveCtx !== ctx;

    // 不需要触发 batch 的情况
    // 1. 如果是上游的 ctx 则不会对本次操作做任何的 batch 触发，交给上游的 batch 来完成这个触发
    // 2. 使用的是本体 ctx 但 triggerTarget 是 setter 也不用对 batch 进行触发
    if (isUpperCtx || effectiveCtx.triggerTarget === 'setter') {
      const res = fn.call(this, ...args);
      // 释放依赖，ctx 出栈
      batchMap.batchFinish();
      return res;
    }

    // 做触发前的数据克隆
    const proxyThis = isObservable(this) ? this : targetToProxy.get(this);
    const _proxies = proxyThis ? [...proxies, proxyThis] : [...proxies];

    const oldValues = _proxies.map(p => {
      const raw = p.__$_raw;
      return effectiveCtx.needDeepClone
        ? cloneDeepWith(raw, val => (isObservable(val) ? val.__$_raw : val))
        : clone(raw);
    });

    // 收集提供的基础依赖
    _proxies.forEach(p => batchMap.trackProxy(p));

    const res = fn.call(proxyThis, ...args);

    // 释放依赖，ctx 出栈
    batchMap.batchFinish();

    _proxies.forEach((p, i) => {
      const oldVal = oldValues[i];
      loopParent([BATCH], p, oldVal, p.__$_raw, effectiveCtx.batchName ?? fn.name, p);
    });

    afterSetFns.exec();
    return res;
  } as unknown as T;
}
