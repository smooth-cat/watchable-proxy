import { batchSet, watch, watchable, BatchOpt, BATCH } from './index';
import { isObservable } from './util';

describe('batch-action', () => {
  function createObj() {
    return watchable({
      a: 10,
      b: 20,
      c: 30
    });
  }
  function allDouble(obj) {
    for (const key in obj) {
      obj[key] = obj[key] * 2;
    }
  }

  it('use normal batch', () => {
    const obj = createObj();

    const allD = batchSet(allDouble);

    const batchWatcher = jest.fn();
    const setterWatcher = jest.fn();

    watch(obj, BATCH, props => {
      batchWatcher(props);
    });
    watch(obj, '.*n', props => {
      setterWatcher(props);
    });

    allD(obj, BatchOpt({ proxies: [obj] }));

    expect(batchWatcher).toHaveBeenCalledWith({
      matchedIndex: 0,
      matchedRule: '__$_batch',
      oldVal: { a: 10, b: 20, c: 30 },
      newVal: { a: 20, b: 40, c: 60 },
      path: '__$_batch',
      paths: ['__$_batch'],
      type: 'allDouble',
      target: obj,
    });

    expect(setterWatcher).toHaveBeenCalledTimes(0);
  });

  it('use normal batch with deep clone old value', () => {
    const arr = watchable([{ v: 1 }, { v: 2 }, { v: 3 }]);
    // 让底下的对象变成 proxy
    arr[0] = arr[0];
    const allDouble = batchSet(
      () => {
        arr.forEach(it => (it.v = it.v * 2));
      },
      { proxies: [arr], batchName: 'allDouble', needDeepClone: true }
    );

    const batchWatcher = jest.fn();

    watch(arr, BATCH, props => {
      props.newVal = JSON.stringify(props.newVal);
      props.oldVal = JSON.stringify(props.oldVal);
      batchWatcher(props);
    });

    allDouble();

    expect(batchWatcher).toHaveBeenCalledWith({
      matchedIndex: 0,
      matchedRule: '__$_batch',
      oldVal: JSON.stringify([{ v: 1 }, { v: 2 }, { v: 3 }]),
      newVal: JSON.stringify([{ v: 2 }, { v: 4 }, { v: 6 }]),
      path: '__$_batch',
      paths: ['__$_batch'],
      type: 'allDouble',
      target: arr,
    });
  });

  it('use initial batch option both|setter|method', () => {
    const obj = createObj();

    const allDBoth = batchSet(allDouble, { triggerTarget: 'both', proxies: [obj] });
    const allDSetter = batchSet(allDouble, { triggerTarget: 'setter', proxies: [obj] });
    const allDMethod = batchSet(allDouble, { triggerTarget: 'method', proxies: [obj] });

    const batchWatcher = jest.fn();
    const setterWatcher = jest.fn();

    watch(obj, BATCH, props => {
      batchWatcher(props);
    });

    watch(obj, '*', props => {
      setterWatcher(props);
    });
    // 这里是为了测试正则是否会匹配到 __$_batch 正常情况下不会触发，即一次调用会触发 3次 watcher
    watch(obj, /\w+/, props => {
      setterWatcher(props);
    });

    /** both 两个 watcher 都会触发 */
    allDBoth(obj);
    expect(batchWatcher).toHaveBeenCalledTimes(1);
    expect(setterWatcher).toHaveBeenCalledTimes(6);
    /** setter 不会触发 batch 的 watcher */
    allDSetter(obj);
    expect(batchWatcher).toHaveBeenCalledTimes(1);
    expect(setterWatcher).toHaveBeenCalledTimes(12);
    /** method（默认） 只触发 batch 的 watcher */
    allDMethod(obj);
    expect(batchWatcher).toHaveBeenCalledTimes(2);
    expect(setterWatcher).toHaveBeenCalledTimes(12);
  });

  it('track deep setter', () => {
    const obj = watchable({
      a: {
        b: 10
      }
    });

    function _setB(value: number) {
      obj.a.b = value;
    }

    const setB = batchSet(_setB, { proxies: [obj] });

    const batchWatcher = jest.fn();
    const setterWatcher = jest.fn();
    watch(obj, BATCH, batchWatcher);
    watch(obj, 'a.b', setterWatcher);
    setB(20);

    expect(batchWatcher).toHaveBeenCalledTimes(1);
    expect(setterWatcher).toHaveBeenCalledTimes(0);
  });

  it('test this', () => {
    class Test {
      a: string = 'foo';
      handleA = batchSet(function handleA(){
        this.a = 'baz'
      })
    }

    const obj = watchable(new Test());
    watch(obj, BATCH, ({ oldVal, newVal }) => {
      expect(oldVal.a).toBe('foo');
      expect(newVal.a).toBe('baz');
    })
    obj.handleA()
  })

  it('test raw value has proxy ref', () => {
    const item = watchable({v:1});
    const arr = watchable([item, {v:2}]);
    watch(arr, ({ oldVal, newVal }) => {
      expect(isObservable(oldVal[0])).toBe(false);
      expect(isObservable(newVal[0])).toBe(true);
    })
    arr.sliceSelf(0,1,BatchOpt({ needDeepClone: true }));
  })
});

describe('nest batch', () => {
  it('upper ctx valid', () => {
    const obj = watchable({
      arr: [{ v: 1 }, { v: 2 }, { v: 3 }],
      finished: false
    });

    const arr = obj.arr;

    const doubleVal = batchSet(
      arr => {
        arr.forEach(it => (it.v = it.v * 2));
      },
      { proxies: [arr], batchName: 'doubleVal' }
    );

    const doubleAndFlagFinished = batchSet(
      (obj: any) => {
        doubleVal(obj.arr);
        obj.finished = true;
      },
      { proxies: [obj], batchName: 'doubleAndFlagFinished' }
    );

    const arrWatcher = jest.fn();
    const objWatcher = jest.fn();
    watch(arr, BATCH, ({ type }) => {
      arrWatcher(type);
    });

    watch(obj, BATCH, ({ type }) => {
      objWatcher(type);
    });

    doubleAndFlagFinished(obj);

    expect(arrWatcher).toHaveBeenCalledTimes(0);
    expect(objWatcher).toHaveBeenCalledTimes(1);
    expect(objWatcher).toHaveBeenCalledWith('doubleAndFlagFinished');
  });

  it('inner ctx use ignoreUpperCtx, inner ctx valid', () => {
    const obj = watchable({
      arr: [{ v: 1 }, { v: 2 }, { v: 3 }],
      finished: false
    });

    const arr = obj.arr;

    const doubleVal = batchSet(
      arr => {
        arr.forEach(it => (it.v = it.v * 2));
      },
      { proxies: [arr], batchName: 'doubleVal', ignoreUpperCtx: true }
    );

    const doubleAndFlagFinished = batchSet(
      (obj: any) => {
        doubleVal(obj.arr);
        obj.finished = true;
      },
      { proxies: [obj], batchName: 'doubleAndFlagFinished' }
    );

    const arrWatcher = jest.fn();
    const objWatcher = jest.fn();
    watch(arr, BATCH, ({ path, type }) => {
      arrWatcher(type);
    });

    watch(obj, BATCH, ({ matchedRule, path, type }) => {
      objWatcher(type);
    });

    doubleAndFlagFinished(obj);

    expect(arrWatcher).toHaveBeenCalledWith('doubleVal');
    expect(objWatcher).toHaveBeenCalledTimes(1);
    expect(objWatcher).toHaveBeenNthCalledWith(1, 'doubleAndFlagFinished');
  });
});
