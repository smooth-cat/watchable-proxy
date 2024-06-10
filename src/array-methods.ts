import { ExtendedBatchFunction, IBatchSetOption, batchSet } from './batch-action';

function indexParse(i: number, len: number) {
  if (i < -len) {
    i = 0;
  } else if (i < 0) {
    i = len + i;
  } else if (i >= len) {
    i = len;
  }
  return i;
}

// TODO: 完成剩余 Array 原地方法的重写
export const createArrayMethods = () => {
  const EXTEND_METHODS = {
    filterSelf: batchSet(
      function (callback: (item: any, i: number, arr: any[]) => any) {
        const raw = this.__$_raw;

        // 开始过滤
        const len = raw.length;
        /** 表示过滤后留下的数组最后一项的位置 */
        let filteredI = -1;
        let i = 0;
        while (i < len) {
          const item = this[i];

          const needRemove = !callback(item, i, this);
          // 如果留下就往 filteredI + 1 放上去
          if (!needRemove) {
            this[filteredI + 1] = item;
            filteredI++;
          }
          i++;
        }

        // 删除多余的项，必须要做，取消 parent 中的引用项
        for (let j = filteredI + 1; j < len; j++) {
          delete this[j];
        }

        // 改变数组长度
        this.length = filteredI + 1;
        return this;
      },
      {
        triggerTarget: 'method',
        batchName: 'filterSelf'
      }
    ),

    mapSelf: batchSet(
      function <R>(callback: (item: any, i: number, arr: any[]) => R): R[] {
        const raw = this.__$_raw;
        for (let i = 0; i < raw.length; i++) {
          const item = this[i];
          const res = callback(item, i, this);
          this[i] = res;
        }
        return this;
      },
      {
        triggerTarget: 'method',
        batchName: 'mapSelf'
      }
    ),

    sliceSelf: batchSet(
      function (start: number, _end?: number) {
        const raw = this.__$_raw;
        const len = raw.length;

        start = indexParse(start, len);

        let end = typeof _end === 'number' ? _end : len;
        end = indexParse(end, len);

        // 如果 start 超过数组长度，或者 end 小于 start 的话提取的就是空数组
        if (start >= len || end <= start) {
          // 删除也是为了解除子项proxy 和 父项的联系
          for (let i = 0; i < len; i++) {
            delete this[i];
          }
          this.length = 0;
          return;
        }

        let slicedI = -1;
        // 如果 start 是 0 则不需要移动
        if (start === 0) {
          slicedI = end - 1;
        }
        // 正常情况则进行对应部分的移动
        else {
          for (let i = start; i < end; i++) {
            this[slicedI + 1] = this[i];
            slicedI++;
          }
        }

        // 删除多余的项，必须要做，取消 parent 中的引用项
        for (let j = slicedI + 1; j < len; j++) {
          delete this[j];
        }

        this.length = end - start;
      },
      {
        triggerTarget: 'method',
        batchName: 'sliceSelf'
      }
    )
  };

  const OVERWRITE_METHODS = Object.keys(METHOD_NAMES).reduce<any>((obj, name) => {
    const method = Array.prototype[name];
    obj[name] = batchSet(method, {
      batchName: name,
      triggerTarget: 'method'
    });
    return obj;
  }, {});

  return { ...EXTEND_METHODS, ...OVERWRITE_METHODS };
};

/** 统一枚举需要重写的数组方法，使用对象是方便 typescript 类型推断 */
const METHOD_NAMES = {
  push: '',
  pop: '',
  reverse: '',
  shift: '',
  unshift: '',
  splice: '',
  sort: '',
};

type RewriteName = keyof typeof METHOD_NAMES;

type ReWriteMethods<R> = {
  [key in RewriteName]: ExtendedBatchFunction<Array<R>[key]>;
};

export type ExtendMethods<T> = {
  filterSelf?: (callback: (item: T, i: number, arr: T[]) => any, conf?: IBatchSetOption) => T[];
  mapSelf?: <R>(callback: (item: T, i: number, arr: T[]) => R, conf?: IBatchSetOption) => R[];
  sliceSelf?: (start: number, end?: number | IBatchSetOption, conf?: IBatchSetOption) => T[];
};

export type DeepExtendArray<T> = T extends Function | undefined | null
  ? T
  : T extends Record<any, any>
  ? T extends Array<infer R>
    ? Omit<Array<DeepExtendArray<R>>, RewriteName> & ExtendMethods<R> & ReWriteMethods<R>
    : { [k in keyof T]: DeepExtendArray<T[k]> }
  : T;
