import { watchable, watch, watchMap, hasOwn } from './index';

describe('watchable', () => {
  it('get', () => {
    const proxy = watchable({ a: 10, b: { c: 'foo' } });
    expect(proxy.a).toBe(10);

    const { b } = proxy;

    // __isObservableObj 标记该对象为代理对象
    expect(b.__isObservableObj).toBe(true);
    // 该对象在上层对象下的 key 为 b
    expect(b.__key).toBe('b');
    // 该对象的上层对象 为 proxy
    expect(b.__parent).toBe(proxy);
  });

  it('set', () => {
    const proxy = watchable({ a: 10 });
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
    expect(proxy.__private).toEqual({
      __isObservableObj: true,
      __parent: null,
      __key: ''
    });
  });

  it('move an obj-prop to another prop， __key will change into new prop name', () => {
    const proxy = watchable({
      a: { b: 10 },
      x: 0
    });

    proxy.x = proxy.a;
    expect(proxy.x.__private).toEqual({
      __isObservableObj: true,
      __parent: proxy,
      // __key changes from 'a' into 'x'
      __key: 'x'
    });
  });
});

describe('watch', () => {
  function createSampleProxy() {
    return watchable({
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
