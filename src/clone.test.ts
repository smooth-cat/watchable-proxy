import { cloneWatchable, watchable, cloneRaw } from './index';
import { clone, cloneDeepWith } from './clone';
import { getType, isObservable } from './util';

describe('clone api', () => {
  it('clone basic type', () => {
    const obj = {
      num: clone(0),
      undef: clone(undefined),
      nul: clone(null),
      str: clone('str')
    };
    expect(obj).toEqual({
      num: 0,
      undef: undefined,
      nul: null,
      str: 'str'
    });
  });

  it('clone array', () => {
    const arr = [{ v: 1 }, { v: 2 }, { v: 3 }];

    const cloned = clone(arr);

    expect(arr).not.toBe(cloned);

    expect(arr[0]).toBe(cloned[0]);
  });
});

describe('clone deep with api', () => {
  const circularObj = () => {
    const obj = {
      a: 10,
      b: [{ v: 'foo' }, { v: 'bar' }, { v: 'baz' }]
    };
    obj.b.forEach(it => (it['root'] = obj));
    obj['root'] = obj;
    obj['c'] = obj.b;
    return obj;
  };

  const normalObj = () => {
    const obj = {
      a: 10,
      b: [{ v: 'foo' }, { v: 'bar' }, { v: 'baz' }]
    };
    return obj;
  };

  function compareTwoDeep(obj1, obj2, cb, walkedSet = new WeakSet()) {
    const NoNeedLoop = ['Number', 'String', 'Undefined', 'Null', 'Function'];
    const obj1Type = getType(obj1);
    const obj2Type = getType(obj2);
    // 这些不需要遍历了
    if (NoNeedLoop.includes(obj1Type) || NoNeedLoop.includes(obj2Type) || walkedSet.has(obj1)) {
      return;
    }

    // 是对象则传递给 callback
    cb(obj1, obj2);

    walkedSet.add(obj1);

    // 是数组
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      for (let i = 0; i < obj1.length; i++) {
        compareTwoDeep(obj1[i], obj2[i], cb, walkedSet);
      }
    }

    // 是对象
    for (const key in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, key) && Object.prototype.hasOwnProperty.call(obj2, key)) {
        compareTwoDeep(obj1[key], obj2[key], cb, walkedSet);
      }
    }
  }

  it('clone basic type and Function', () => {
    const fn = () => {};
    const obj = {
      num: cloneDeepWith(0),
      undef: cloneDeepWith(undefined),
      nul: cloneDeepWith(null),
      str: cloneDeepWith('str'),
      fn
    };
    expect(obj).toEqual({
      num: 0,
      undef: undefined,
      nul: null,
      str: 'str',
      fn
    });
  });

  it('clone unhanded', () => {
    const sym = Symbol(686);
    const cloned = cloneDeepWith(sym);
    expect(sym).toBe(cloned);
  });

  it('clone normal obj', () => {
    const obj = normalObj();
    const cloned = cloneDeepWith(obj);
    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  it('clone array', () => {
    const obj = [{ v: 1 }, { v: 2 }, { v: 3 }];
    const cloned = cloneDeepWith(obj);
    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  it('clone circular obj', () => {
    const obj = circularObj();
    const cloned = cloneDeepWith(obj);
    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  it('clone and double number', () => {
    const obj = [{ v: 1 }, { v: 2 }, { v: 3 }];
    const cloned = cloneDeepWith(obj, value => {
      if (typeof value === 'number') {
        return value * 2;
      }
      return value;
    });

    expect(cloned).toEqual([{ v: 2 }, { v: 4 }, { v: 6 }]);

    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
    });
  });

  it('clone watchable', () => {
    const obj = watchable({
      a: 10,
      b: [{v:1},{v:2},{v:3}]
    })
    const cloned = cloneWatchable(obj);
    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
    });
  })

  it('clone watchable with callback', () => {
    const obj = watchable({
      a: 10,
      b: [{v:1},{v:2},{v:3}]
    })
    const cloned = cloneWatchable(obj, (v) => {
      return typeof v === 'number' ? v * 2 : v;
    });
    compareTwoDeep(obj, cloned, (a, b) => {
      expect(a).not.toBe(b);
    });
  })


});



describe('cloneRaw api', () => {
  it('clone watchable into raw', () => {
    const p = watchable({
      a: {
        b: 10,
      }
    })

    // object a has been proxify
    p.a = p.a;
    expect(isObservable(p.a)).toBe(true);

    const rawCloned = cloneRaw(p);
    expect(isObservable(rawCloned.a)).toBe(false);
  })
})