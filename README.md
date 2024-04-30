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
      d: 'hello world',
    }
  }
});

// the second param can be String、RegExp、(String|RegExp)[], 
// it's for matching the “path” prop in callback
const dispose = watch(proxy, ['a.b.c'], ({ path, oldVal, newVal, type, paths }) => {
  console.log({
    // when execute "proxy.a.b.c = 20", callback called, props are:
 		path,   // 'a.b.c'
    oldVal, // 10
    newVal, // 20
    type,   // 'SET' (type includes 'SET' | 'ADD' | 'DEL' )
    paths,  // ['a', 'b', 'c']
    matchedIndex, // 0
    matchedRule,  // 'a.b.c'
  })
  
  console.log(proxy.a.b.c) // 10
  // the function  will called after set
  return () => {
    // you can get the modified object
    console.log(proxy.a.b.c) // 20
  }
});

proxy.a.b.c = 20;

// if you don't want watch any more, do dispose
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
function fn1() { }
proxy.a.b.c = 20; // fn1 called
proxy.a.b.d = 20; // fn1 called

// watch any props or subProps of “a” change
watch(proxy, ['a.**'], fn2);
function fn2() { }
proxy.a.b.c = 30;   // fn2 called
proxy.a.x = 30;     // fn2 called (type -> 'ADD')

// watch any item of “arr” change
watch(proxy, ['arr.*n', 'arr.*n.**'], fn3);
function fn3() { }
proxy.arr.push(2);       // fn3 called, match 'arr.*n'
proxy.arr[2] = 'baz';    // fn3 called
delete proxy.arr[2];     // fn3 called
proxy.arr[0].foo = 'bar' // fn3 called, match 'arr.*n.**'
```

## regexp match

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
function fn1() { }

proxy.a.b.c = 20; // fn1 called
proxy.a.b.d = 30; // fn1 called
```

## watch share and watch pass

```typescript
const a = watchable({ });
const b = watchable({ });
const c = watchable({ value: 10 });

a.c = c;
b.c = c;

watch(a, ['c'], aWatcher);
function aWatcher() { }

watch(b, ['c'], bWatcher);
function bWatcher() { }

// both aWatcher and bWatcher will be called
c.value = 20
```

## circular reference

#### when raw object has circular reference, the parent("c") can't watch changes of the circular ref("a")

```typescript
// a -> b -> c -> a  ( circular ref  )
//      | -> d

const rawA: any = {
  b: {
    c: {},
    d: 'd'
  }
};
rawA.b.c.a = rawA;

const a = watchable(rawA);
function aWatcher() { }
watch(a, aWatcher);

const c = a.b.c;
function cWatcher() { }
watch(c, cWatcher);

// aWatcher will be called, 
// but cWatcher will not be called 
// even d is a child node of c by circular ref
a.b.c.d = 'joker';
```

#### manually make circular ref after make watchable

1. use assignment expression, **circular node's change will trigger watchers all the way up until the node been walked**;
2. use setProp api，will work like above raw circular ref case

```typescript
// a -> b -> c -> a  ( circular ref  )
//      | -> d

const a = watchable({
  b: {
    c: {},
    d: 'd'
  }
});
const c = a.b.c;

// manually make circular ref by assignment expression
// c.a = a;

// manually make circular ref by setProp api
setProp(c, 'a', a, { withoutWatchTrain: true });

function aWatcher() { }
watch(a, aWatcher);

function cWatcher() { }
watch(c, cWatcher);


// aWatcher will be called normally
// use assignment expression : cWatcher will  be called
//           use setProp api : cWatcher won't be called
a.b.c.d = 'joker';
```

## setProp and no trigger watchers single time

```typescript
const p = watchable({ value: 10 });

function watcher() { }
watch(p, watcher);

// use noTriggerWatcher the watcher will no be trigger this time
setProp(p, 'value', 10, { noTriggerWatcher: true });
```

## specific getter

```typescript
const p = watchable({ a: { value: 10 } });

const { a } = p;
// get raw object of a
// often used to get raw object which created by system class
a['__$_raw']             
a['__$_parents']         // get "[p]"
a['__$_isObservableObj'] // get "true"
```

## "this" of an function property

#### "this" of array's method

```typescript
// if the method is belong to an array,
// "this" will always bind to "proxy receiver" 
// to make sure array's operator like "push" "splice"
// can be watched correctly;
const arr =  watchable([0,1,2]);
push = arr.push;

function watcher() { }
watch(arr, ['*n'], watcher);

// watcher can be triggerd
push(3);
```

#### "this" of function belongs to an literal object or instance of a class

```typescript
class A {
  value= 10;
  getSum(v: number = 0) {
    return this.value + v
  }
}

const rawA = new A();
const a = watchable(rawA);

const { getSum } = a;
getSum(1) // return 11

// use fn.call, apply and bind as well
const b = { value: 20 };
getSum.call(b, 1); // return 21
```
