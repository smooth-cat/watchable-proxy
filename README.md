# watchable-proxy
Convert object to proxy that can be watched deeply and conditionally<br/>

## usage

```javascript
import { watchable, watch } form 'watchable-proxy';
// support commonjs require
// const { watchable, watch } = require('watchable-proxy');

const proxy = watchable({
  a: {
    b: {
      c: 10,
      d: 20,
    }
  }
});

// the second param can be String、RegExp、(String|RegExp)[], 
// it's for matching the “path” prop in callback
const dispose = watch(proxy, ['a.b.c'], ({ path, oldVal, newVal, type, paths }) => {
  console.log({
    // when execute proxy.a.b.c = 20, callback called, props are:
 		path,   // 'a.b.c'
    oldVal, // 10
    newVal, // 20
    type,   // 'SET' (type includes 'SET' | 'ADD' | 'DEL' )
    paths   // ['a', 'b', 'c']
  })
});

proxy.a.b.c = 20;

// if you don't want watch any more, do dsipose
dispose();
```

## fuzzy match

```js
const proxy = watchable({
  a: {
    b: {
      c: 10,
      d: 20,
    },
  },
  arr: [{ foo: 0 }, 1]
});

// watch any prop of “b” change
watch(proxy, ['a.b.*'], fn1);
function fn1({ path, oldVal, newVal, type, paths }) { }
proxy.a.b.c = 20; // fn1 called
proxy.a.b.d = 20; // fn1 called

// watch any props or subProps of “a” change
watch(proxy, ['a.**'], fn2);
function fn2({ path, oldVal, newVal, type, paths }) { }
proxy.a.b.c = 30;   // fn2 called
proxy.a.x = 30;     // fn2 called (type -> 'ADD')

// watch any item of “arr” change
watch(proxy, ['arr.*n', 'arr.*n.**'], fn3);
function fn3({ path, oldVal, newVal, type, paths }) { }
proxy.arr.push(2);       // fn3 called, match 'arr.*n'
proxy.arr[2] = 'baz';    // fn3 called
delete proxy.arr[2];     // fn3 called
proxy.arr[0].foo = 'bar' // fn3 called, match 'arr.*n.**'
```

## RegExp macth

```js
const proxy = watchable({
  a: {
    b: {
      c: 10,
      d: 20,
    },
  },
  arr: [0, 1]
});

// if “/a\.b\.[^\.]+/.test(path)” is true , fn1 will be called
watch(proxy, [/a\.b\.[^\.]+/], fn1);
function fn1({ path, oldVal, newVal, type, paths }) { }

proxy.a.b.c = 20; // fn1 called
proxy.a.b.d = 30; // fn1 called
```