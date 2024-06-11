import { watchable, watch, setProp, Scope, batchSet, deleteProp } from './index';
import { afterSetFns } from './var';
import { hasOwn } from './util';
import { BatchOpt } from './batch-action';

type IParentItem = {
  parent: any;
  key: string;
};

const pvt = (proxy, ...args: IParentItem[]) => {
  return {
    isObservableObj: true,
    parents: args,
    raw: proxy['__$_raw']
  };
};

describe('watchable', () => {
  it('get', () => {
    const proxy = watchable({ a: 10, b: { c: 'foo' } });
    expect(proxy.a).toBe(10);

    const { b } = proxy;

    // __isObservableObj 标记该对象为代理对象
    expect(b['__$_isObservableObj']).toBe(true);

    // 该对象的上层对象 为 proxy
    // 该对象在上层对象下的 key 为 b
    expect(b['__$_parents']).toEqual([
      {
        parent: proxy,
        key: 'b'
      }
    ]);
  });

  it('set', () => {
    const proxy = watchable<any>({ a: 10 });
    proxy.a = 20;
    proxy.b = 30;
    expect(proxy.a).toBe(20);
    expect(proxy.b).toBe(30);
  });

  it('set self, parents still will be one', () => {
    const proxy = watchable<any>({ a: {b:10} });
    const a = proxy.a;
    proxy.a = a;
    expect(a['__$_parents'].length).toBe(1); 
  });

  it('delete', () => {
    const proxy = watchable({ a: 10 });
    delete proxy.a;
    expect(hasOwn(proxy, 'a')).toBe(false);
  });

  it('get objet twice， proxy must be same', () => {
    const proxy = watchable({ a: { b: 10 } });
    const sameProxy = watchable(proxy);
    expect(proxy).toBe(sameProxy);
  });

  it('get private', () => {
    const proxy = watchable({ a: { b: 10 } });
    expect(proxy['__$_private']).toEqual(pvt(proxy));
  });
});

describe('watch', () => {
  function createSampleProxy() {
    return watchable<any>({
      a: {
        b: {
          c: 10,
          d: 20
        }
      },
      arr: [{ foo: 0 }, 1]
    });
  }

  it('exact match', () => {
    const p = createSampleProxy();
    const spy = jest.fn();

    watch(p, ['a.b.c'], props => {
      spy(props);
    });

    p.a.b.c = 20;

    expect(spy).toHaveBeenCalledWith({
      path: 'a.b.c',
      oldVal: 10,
      newVal: 20,
      type: 'SET',
      paths: ['a', 'b', 'c'],
      matchedIndex: 0,
      matchedRule: 'a.b.c'
    });
  });

  it('string match', () => {
    const p = createSampleProxy();
    const spy = jest.fn();
    watch(p, 'a.b', spy);
    p.a.b = 0;
    expect(spy).toHaveBeenCalled();
  });

  it('regexp match', () => {
    const p = createSampleProxy();
    const spy = jest.fn();
    watch(p, /a\.b/, spy);
    p.a.b = 0;
    expect(spy).toHaveBeenCalled();
  });

  it('match any', () => {
    const p = createSampleProxy();
    const spy = jest.fn();
    watch(p, spy);
    p.a.b = 0;
    p.a.arr = 10;
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('dispose', () => {
    const p = createSampleProxy();
    const spy = jest.fn();
    const dispose = watch(p, ['a.b'], spy);
    p.a.b = 0;
    expect(spy).toHaveBeenCalledTimes(1);
    dispose();
    p.a.b = 1;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('trigger watcher by temp', () => {
    const p = createSampleProxy();
    const spy = jest.fn();
    watch(p, ['a.b'], spy);
    const { a: temp } = p;
    temp.b = 0;
    expect(spy).toHaveBeenCalled();
  });

  it('get latest value by set', () => {
    const p = watchable({ v: 'old' });
    watch(p, () => {
      expect(p.v).toBe('old');
      return () => {
        expect(p.v).toBe('new');
      };
    });
    p.v = 'new';
  });

  it('get latest value by delete', () => {
    const p = watchable({ v: 'old' });
    watch(p, () => {
      expect(p.v).toBe('old');
      return () => {
        expect(p.v).toBe(undefined);
      };
    });
    delete p.v;
  });

  it('fuzzy match *', () => {
    const p = createSampleProxy();
    const fn1 = jest.fn();
    watch(p, ['a.b.*'], props => fn1(props));

    p.a.b.c = 30;
    expect(fn1).toHaveBeenCalledWith({
      path: 'a.b.c',
      oldVal: 10,
      newVal: 30,
      type: 'SET',
      paths: ['a', 'b', 'c'],
      matchedIndex: 0,
      matchedRule: 'a.b.*'
    });

    p.a.b.e = 30;
    expect(fn1).toHaveBeenCalledWith({
      path: 'a.b.e',
      oldVal: undefined,
      newVal: 30,
      type: 'ADD',
      paths: ['a', 'b', 'e'],
      matchedIndex: 0,
      matchedRule: 'a.b.*'
    });
  });

  it('fuzzy match **', () => {
    const p = createSampleProxy();
    const fn2 = jest.fn();
    watch(p, ['a.**'], props => fn2(props));
    p.a.b.c = 30; // fn2 called
    expect(fn2).toHaveBeenCalledWith({
      path: 'a.b.c',
      oldVal: 10,
      newVal: 30,
      type: 'SET',
      paths: ['a', 'b', 'c'],
      matchedIndex: 0,
      matchedRule: 'a.**'
    });

    p.a.x = 30; // fn2 called (type -> 'ADD')
    expect(fn2).toHaveBeenCalledWith({
      path: 'a.x',
      oldVal: undefined,
      newVal: 30,
      type: 'ADD',
      paths: ['a', 'x'],
      matchedIndex: 0,
      matchedRule: 'a.**'
    });
  });

  it('fuzzy match arr', () => {
    const p = createSampleProxy();
    const fn3 = jest.fn();
    watch(p, ['arr.*n', 'arr.*n.**', 'arr.__$_batch'], ({...props}) => {
      props.newVal = JSON.stringify(props.newVal)
      props.oldVal = JSON.stringify(props.oldVal)
      fn3(props)
    });
    p.arr.push(2); // fn3 called, match __$_batch
    expect(fn3).toHaveBeenNthCalledWith(1, {
      path: 'arr.__$_batch',
      oldVal: JSON.stringify([{ foo: 0 }, 1]),
      newVal: JSON.stringify([{ foo: 0 }, 1, 2]),
      type: 'push',
      paths: ['arr', '__$_batch'],
      matchedIndex: 2,
      matchedRule: 'arr.__$_batch'
    });
    p.arr[2] = 'baz'; // fn3 called
    expect(fn3).toHaveBeenNthCalledWith(2, {
      path: 'arr.2',
      oldVal: '2',
      newVal: "\"baz\"",
      type: 'SET',
      paths: ['arr', '2'],
      matchedIndex: 0,
      matchedRule: 'arr.*n'
    });
    delete p.arr[2]; // fn3 called
    expect(fn3).toHaveBeenNthCalledWith(3, {
      path: 'arr.2',
      oldVal: "\"baz\"",
      newVal: undefined,
      type: 'DEL',
      paths: ['arr', '2'],
      matchedIndex: 0,
      matchedRule: 'arr.*n'
    });
    p.arr[0].foo = 'bar'; // fn3 called, match 'arr.*n.**'
    expect(fn3).toHaveBeenCalledTimes(4);
  });

  it('regexp match any props or subProps of proxy.a.b', () => {
    const p = createSampleProxy();
    const fn1 = jest.fn();
    watch(p, [/a\.b\.[^\.]+/], props => fn1(props));

    p.a.b.c = 20; // fn1 called
    expect(fn1).toHaveBeenCalled();

    p.a.b.e = 30; // fn1 called
    expect(fn1).toHaveBeenNthCalledWith(2, {
      path: 'a.b.e',
      oldVal: undefined,
      newVal: 30,
      type: 'ADD',
      paths: ['a', 'b', 'e'],
      matchedIndex: 0,
      matchedRule: /a\.b\.[^\.]+/
    });
  });
});

describe('watch transfer', () => {
  it('assign a proxy to another proxy’s prop ， the later will be add into the former‘s __parents list', () => {
    const proxy = watchable<any>({
      a: { b: 10 },
      x: 0
    });

    proxy.x = proxy.a;
    expect(proxy.a['__$_private']).toEqual(
      pvt(
        proxy.a,
        {
          parent: proxy,
          key: 'a'
        },
        {
          parent: proxy,
          key: 'x'
        }
      )
    );
  });

  it('remove a subProxy from parent, the parent will be removed from subProxy’s __parents list', () => {
    const proxy = watchable({
      a1: { b: 10 },
      a2: { b: 10 }
    });

    // remove by delete
    const tempA1 = proxy.a1;
    delete proxy.a1;

    const fn1 = jest.fn();
    // 删除了 tempA1 说明 __parents 不存在任何父引用
    expect(tempA1['__$_private']).toEqual(pvt(tempA1));

    watch(proxy, 'a1.*', fn1);
    tempA1.b = 20;
    expect(fn1).toHaveBeenCalledTimes(0);

    // remove by set
    const tempA2 = proxy.a2;
    proxy.a2 = 12 as any;

    expect(tempA2['__$_private']).toEqual(pvt(tempA2));

    const fn2 = jest.fn();
    watch(proxy, 'a2.*', fn2);
    tempA2.b = 20;
    expect(fn2).toHaveBeenCalledTimes(0);
  });

  it('a proxy ref a subProxy of another proxy, the subProxy will add the former into it‘s __parents list', () => {
    const p1 = watchable({
      a: { b: 10 }
    });
    const p2 = watchable({
      a1: { b: 20 }
    });

    p1.a = p2.a1;

    expect(p1.a['__$_private']).toEqual(
      pvt(
        p1.a,
        {
          parent: p2,
          key: 'a1'
        },
        {
          parent: p1,
          key: 'a'
        }
      )
    );

    const fn1 = jest.fn();
    const fn2 = jest.fn();
    watch(p1, 'a.*', fn1);
    watch(p2, 'a1.*', fn2);
    p2.a1.b = 40;
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });
});

describe('circular ref', () => {
  /**
   * a -> b -> c -> a(循环引用)
   *      | -> d
   */
  it('watch raw circular ref, it won‘t trigger to circular ref object’s parent‘s watcher and upper’s', () => {
    const a: any = {
      b: {
        c: {},
        d: 'd'
      }
    };
    a.b.c.a = a;

    const aProxy = watchable(a);
    const fn = jest.fn();
    watch(aProxy, fn);

    const tempA = a.b.c.a;
    // 即使触发了 c.a 的 get 也 监听不到，因为 a 创建后就会被保存到 map 在触发 get 时直接返回 proxy，而不会重新创建 proxy
    const cTemp = aProxy.b.c;
    const cWatcher = jest.fn();
    watch(cTemp, cWatcher);

    aProxy.b.d = 'joker';
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cWatcher).toHaveBeenCalledTimes(0);
  });

  /**
   * a -> b -> c -> a(循环引用)
   *      | -> d
   */
  it('a watchable proxy circular ref a watchable, it will trigger watchers until find the node has been looped', () => {
    const a: any = {
      b: {
        c: {},
        d: 'd'
      }
    };
    const aProxy = watchable<any>(a);
    // set 时 c 被加入 aProxy 的 __parents 中
    aProxy.b.c.a = aProxy;
    const fn = jest.fn();
    watch(aProxy, fn);

    // 使用赋值方式后
    const cTemp = aProxy.b.c;
    const cWatcher = jest.fn();
    watch(cTemp, props => cWatcher(props));

    aProxy.b.d = 'joker';
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cWatcher).toHaveBeenCalledWith({
      newVal: 'joker',
      oldVal: 'd',
      path: 'a.b.d',
      paths: ['a', 'b', 'd'],
      type: 'SET'
    });
  });
});

describe('setProp api', () => {
  /**
   * a -> b -> c -> a(循环引用)
   *      | -> d
   */
  it('use withoutWatchTrain to avoid circular ref object’s parent‘s watcher been called', () => {
    const a: any = {
      b: {
        c: {},
        d: 'd'
      }
    };
    const aProxy = watchable<any>(a);
    // 使用 pureRef 避免循环引用的对象的 父对象触发 watcher
    setProp(aProxy.b.c, 'a', aProxy, { withoutWatchTrain: true });
    const fn = jest.fn();
    watch(aProxy, fn);

    // 使用赋值方式后
    const cTemp = aProxy.b.c;
    const cWatcher = jest.fn();
    watch(cTemp, cWatcher);

    aProxy.b.d = 'joker';
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cWatcher).toHaveBeenCalledTimes(0);
  });

  it('set base type prop', () => {
    const p = watchable({ a: 10 });
    const fn = jest.fn();
    watch(p, props => {
      fn(props);
    });

    setProp(p, 'a', 20);
    expect(fn).toHaveBeenCalledWith({
      newVal: 20,
      oldVal: 10,
      path: 'a',
      paths: ['a'],
      type: 'SET'
    });
  });

  it('set raw object which has no proxy', () => {
    const p = watchable<any>({ a: 10 });
    const fn1 = jest.fn();
    watch(p, 'a', props => fn1(props));

    const rawObj = { b: 20 };
    setProp(p, 'a', rawObj);
    expect(fn1).toHaveBeenCalledWith({
      matchedIndex: 0,
      matchedRule: 'a',
      newVal: rawObj,
      oldVal: 10,
      path: 'a',
      paths: ['a'],
      type: 'SET'
    });

    const fn2 = jest.fn();

    watch(p, 'a.b', props => fn2(props));
    rawObj.b = 40;
    // 设置原对象代理对象不会触发 watcher
    expect(fn2).toHaveBeenCalledTimes(0);
    p.a.b = 50;
    expect(fn2).toHaveBeenCalledWith({
      matchedIndex: 0,
      matchedRule: 'a.b',
      newVal: 50,
      oldVal: 40,
      path: 'a.b',
      paths: ['a', 'b'],
      type: 'SET'
    });
  });

  it('set raw object which has a proxy', () => {
    const p = watchable<any>({ a: 10 });
    const fn1 = jest.fn();
    watch(p, 'a', props => fn1(props));

    const rawObj = { b: 20 };
    const obj = watchable(rawObj);
    setProp(p, 'a', rawObj);
    expect(fn1).toHaveBeenCalledWith({
      matchedIndex: 0,
      matchedRule: 'a',
      newVal: obj,
      oldVal: 10,
      path: 'a',
      paths: ['a'],
      type: 'SET'
    });
  });
});

describe('deleteProp api',() => {
  it('usage', () => {
    const a  = watchable({b:10,c:20});
    const fn = jest.fn();
    watch(a, fn);
    // 相当于 delete a.b
    deleteProp(a, 'b');
    expect(fn).toHaveBeenCalledTimes(1);
  })

  it('deleteProp without trigger watcher', () => {
    const a  = watchable({b:10,c:20});
    const fn = jest.fn();
    watch(a,fn);

    delete a.b;
    expect(fn).toHaveBeenCalledTimes(1);
    deleteProp(a, 'c', { noTriggerWatcher: true });
    expect(fn).toHaveBeenCalledTimes(1);
  })
})

class NormalClass {
  value = 10;
  getSum(v: number = 0) {
    return this.value + v;
  }
}

describe('function this point', () => {
  it('normal class proxy', () => {
    const a = new NormalClass();

    const p = watchable(a);

    const getSum = p.getSum;

    // 使用了高阶函数做执行，相当于在高阶函数中调用 a.getValue()
    expect(getSum()).toBe(10);
  });

  it('normal class proxy use call or apply', () => {
    const a = new NormalClass();

    const obj = { value: 20 };

    const p = watchable(a);

    const getSum = p.getSum;
    // 使用了高阶函数做执行，相当于在高阶函数中调用 a.getValue()
    expect(getSum.call(obj, 1)).toBe(21);
    expect(getSum.apply(obj, [2])).toBe(22);
  });

  it('normal class proxy use bind', () => {
    const a = new NormalClass();

    const obj = { value: 20 };

    const p = watchable(a);

    const getSum = p.getSum;
    getSum.bind(obj);

    // 使用了高阶函数做执行，相当于在高阶函数中调用 a.getValue()
    expect(getSum(3)).toBe(23);
  });
});

describe('use scope', () => {
  it('cancel watchers by dispose', () => {
    const scope = new Scope();
    const p = watchable({ a: 10 });
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    scope.watch(p, fn1);
    p.a = 20;
    expect(fn1).toHaveBeenCalledTimes(1);
    scope.dispose();
    // dispose 取消了 fn1 的监听，但后续监听的 fn2 仍然有效
    scope.watch(p, fn2);
    p.a = 30;
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('cancel watchers by destroy', () => {
    const scope = new Scope();
    const p = watchable({ a: 10 });
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    scope.watch(p, fn1);
    p.a = 20;
    expect(fn1).toHaveBeenCalledTimes(1);
    scope.destroy();
    // destroy 取消了 fn1 的监听并阻止后续监听
    const eptFn = scope.watch(p, fn2);
    p.a = 30;
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(0);
  });

  it('correct empty function in destroy case', () => {
    const scope = new Scope();
    const p = watchable({ a: 10 });
    const fn1 = jest.fn();
    scope.destroy();
    const eptFn = scope.watch(p, fn1);
    expect(typeof eptFn).toBe('function');
    eptFn();
  });
});

describe('nest set', () => {
  it('nest set use assignment expression', () => {
    const a = watchable({ value: 10 });
    const b = watchable({ value: 10 });
    const bWatcher = jest.fn();
    const bCallback = jest.fn();

    watch(a, ({ newVal }) => {
      return () => {
        b.value = newVal;
        expect(bWatcher).toHaveBeenCalledTimes(1);
        expect(bCallback).toHaveBeenCalledTimes(0);
        // aCallback 在执行时已从队列中取出，bCallback 处于队首位置
        expect(afterSetFns.length).toBe(1);
        expect(afterSetFns[0]).toBe(bCallback);
      };
    });

    watch(b, () => {
      bWatcher();
      return bCallback;
    });

    a.value = 20;
    expect(b.value).toBe(20);
  });

  it('nest set use noTriggerWatcher', () => {
    const a = watchable({ value: 10 });
    const b = watchable({ value: 10 });
    const bWatcher = jest.fn();
    const bCallback = jest.fn();

    watch(a, ({ newVal }) => {
      return () => {
        setProp(b, 'value', newVal, { noTriggerWatcher: true });
        expect(bWatcher).toHaveBeenCalledTimes(0);
        expect(bCallback).toHaveBeenCalledTimes(0);
        expect(afterSetFns.length).toBe(0);
      };
    });

    watch(b, props => {
      bWatcher(props);
      return bCallback;
    });

    a.value = 20;
    expect(b.value).toBe(20);
  });
});

