import { cloneRaw } from './clone';
import { watchable, watch, BATCH } from './index';

function createArr() {
  return watchable([{ v: 1 }, { v: 2 }, { v: 3 }]);
}

describe('external methods', () => {
  it('filterSelf', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });

    arr.filterSelf(it => it.v > 1);

    expect(fn).toHaveBeenCalledWith([{ v: 2 }, { v: 3 }]);
  });

  it('mapSelf', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });

    arr.mapSelf(it => it.v * 2);

    expect(fn).toHaveBeenCalledWith([2,4,6]);
  });

  it('sliceSelf', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });

    arr.sliceSelf(0,-1);

    expect(fn).toHaveBeenCalledWith([{ v: 1 }, { v: 2 }]);
  });

  it('sliceSelf without end', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });

    arr.sliceSelf(1);

    expect(fn).toHaveBeenCalledWith([{ v: 2 }, { v: 3 }]);
  });

  it('sliceSelf return [] while start >= length', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });
    /** start >= length 则返回空数组 */
    arr.sliceSelf(5,7);

    expect(fn).toHaveBeenCalledWith([]);
  });
  it('sliceSelf return [] while end <= start', () => {
    const arr = createArr();
    const fn = jest.fn();
    watch(arr, BATCH, ({ newVal }) => {
      fn(cloneRaw(newVal));
    });

    /** -8 < -3(-length) 则实际的 i是0，这时 end <=  start 截取的数组就是空数组 */
    arr.sliceSelf(1, -8);

    expect(fn).toHaveBeenCalledWith([]);
  });
});
