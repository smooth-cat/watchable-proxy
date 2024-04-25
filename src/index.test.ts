import { watchable, watch, watchMap, hasOwn } from './index';

describe('watchable', () => {
  it('get', () => {
    const proxy = watchable({ a: 10, b: { c: 'foo' } });
    expect(proxy.a).toBe(10);

    const { b } = proxy;

    // __isObservableObj 标记该对象为代理对象
    expect(b['__isObservableObj']).toBe(true);
    // 该对象在上层对象下的 key 为 b
    expect(b['__key']).toBe('b');
    // 该对象的上层对象 为 proxy
    expect(b['__parent']).toBe(proxy);
  });

  it('set', () => {
    const proxy = watchable<any>({ a: 10 });
    proxy.a = 20;
    proxy.b = 30;
    expect(proxy.a).toBe(20);
    expect(proxy.b).toBe(30);
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
    expect(proxy['__private']).toEqual({
      __isObservableObj: true,
      __parent: null,
      __key: ''
    });
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
  })

  it('get latest value by set', () => {
    const p = watchable({v:'old'});
    watch(p, () => {
      expect(p.v).toBe('old')
      return () => {
        expect(p.v).toBe('new')
      }
    });
    p.v = 'new';
  })

  it('get latest value by delete', () => {
    const p = watchable({v:'old'});
    watch(p, () => {
      expect(p.v).toBe('old')
      return () => {
        expect(p.v).toBe(undefined)
      }
    });
    delete p.v
  })

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
    watch(p, ['arr.*n', 'arr.*n.**'], props => fn3(props));
    p.arr.push(2); // fn3 called, match 'arr.*n'
    expect(fn3).toHaveBeenCalledWith({
      path: 'arr.2',
      oldVal: undefined,
      newVal: 2,
      type: 'ADD',
      paths: ['arr', '2'],
      matchedIndex: 0,
      matchedRule: 'arr.*n'
    });
    p.arr[2] = 'baz'; // fn3 called
    delete p.arr[2]; // fn3 called
    expect(fn3).toHaveBeenCalledWith({
      path: 'arr.2',
      oldVal: 'baz',
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

describe('watch transfer' , () => {
  it('move an obj-prop to another prop， __key will change into new prop name', () => {
    const proxy = watchable<any>({
      a: { b: 10 },
      x: 0
    });

    proxy.x = proxy.a;
    expect(proxy.x['__private']).toEqual({
      __isObservableObj: true,
      __parent: proxy,
      // __key changes from 'a' into 'x'
      __key: 'x'
    });
  });

  it('remove a sub proxy , its __parent will be null', () => {
    const proxy = watchable({
      a1: { b: 10 },
      a2: { b: 10 },
    });

    // remove by delete
    const tempA1 = proxy.a1;
    delete proxy.a1;

    const fn1 = jest.fn();
    expect(tempA1['__private']).toEqual({
      __isObservableObj: true,
      __parent: null,
      __key: ''
    });

    watch(proxy, 'a1.*',fn1)
    tempA1.b = 20;
    expect(fn1).toHaveBeenCalledTimes(0);

    // remove by set
    const tempA2 = proxy.a2;
    proxy.a2 = null;

    expect(tempA2['__private']).toEqual({
      __isObservableObj: true,
      __parent: null,
      __key: ''
    });

    const fn2 = jest.fn();
    watch(proxy, 'a2.*',fn2)
    tempA2.b = 20;
    expect(fn2).toHaveBeenCalledTimes(0);
  });

  it('a proxy ref a subProxy of another proxy, the __parent and the __key of subProxy will change to the former‘s', () => {
    const p1 = watchable({
      a: {b: 10}
    });
    const p2 = watchable({
      a1: {b: 20}
    });

    p1.a = p2.a1;
    
    expect(p1.a['__private']).toEqual({
      __isObservableObj: true,
      __parent: p1,
      __key: 'a'
    });

    const fn1 = jest.fn();
    const fn2 = jest.fn();
    watch(p1, 'a.*', fn1)
    watch(p2, 'a1.*', fn2)
    p2.a1.b = 40;
    expect(fn1).toHaveBeenCalled();
    // 因为 p2.a1 对象的 __parent 已指向 p1 所以其不再受 p2 监听
    expect(fn2).toHaveBeenCalledTimes(0);
  })
})