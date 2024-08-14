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
      c: 10
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
    type,   // 'SET' (type includes 'SET' | 'ADD' | 'DEL' | batchName )
    paths,  // ['a', 'b', 'c']
    matchedIndex, // 0
    matchedRule,  // 'a.b.c'
  })
  
  console.log(proxy.a.b.c) // 10
  // the function  will called after set
  // you can get the changed object
  return () => {
    console.log(proxy.a.b.c) // 20
  }
});

proxy.a.b.c = 20;

// if you don't want watch any more, do dispose
dispose();
```

## watchGet

```typescript
const proxy = watchable({ a: 10, b: { c: 'foo' } });
watchGet(proxy, ({ path }) => {
  console.log('detect get', path) // 'a'
})
console.log(proxy.a) // 10
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

```

## watch array

### fuzzy match array

```typescript
// watch any set or delete of array
const arr = watchable([ { foo: 0 }, 1 ]);
function fn1() { }
watch(arr, ['*n', '*n.**'], fn1);
arr[1] = 'baz';    // fn1 called, match '*n'
delete arr[1];     // fn1 called
arr[0].foo = 'bar' // fn1 called, match '*n.**'
```

### watch array's in place method

> We give additional [in place](https://zh.wikipedia.org/wiki/%E5%8E%9F%E5%9C%B0%E7%AE%97%E6%B3%95) methods：[filterSelf] , [mapSelf] , [sliceSelf]

```typescript
import { BATCH, BatchOpt } from 'watchable-proxy';
// watch push method, 
watch(arr, [BATCH], fn2);
function fn2({
	path,   // BATCH -> '__$_batch'
	oldVal, // [{ foo: 0 }, 1] -> Array
	newVal, // [{ foo: 0 }, 1, 2, 3] -> Proxy
	type,   // 'push'
	paths,  // [BATCH]
	matchedIndex, // 0
	matchedRule,  // BATCH
}) { }
arr.push(2, 3); // fn2 call 1 times

// watch single set in push
watch(arr, ['*n'], fn3);
function fn3({}) {
  // got below two set action from push
  // 1. arr[2] = 2
  // 2. arr[3] = 3
}
// fn3 call 2 times
// in 'setter' way, BATCH watcher won't trigger
arr.push(2, 3, BatchOpt({ triggerTarget: 'setter' })); 
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
});

// if “/a\.b\.[^\.]+/.test(path)” is true , fn1 will be called
watch(proxy, [/a\.b\.[^\.]+/], fn1);
function fn1() { }

proxy.a.b.c = 20; // fn1 called
proxy.a.b.d = 30; // fn1 called
```

## [Scope] api , batch cancel watch

```typescript
const scope = new Scope();
const p = watchable({ a: 10 });
function fn1() { }
function fn2() { }
scope.watch(p, fn1);
scope.watch(p, fn2);
p.a = 20; // fn1, fn2 called

scope.dispose();
p.a = 30; // fn1, fn2 won't call
```

## [setProp] api , no trigger watchers single time

```typescript
const p = watchable({ value: 10 });

function watcher() { }
watch(p, watcher);

// use noTriggerWatcher the watcher will no be trigger this time
setProp(p, 'value', 10, { noTriggerWatcher: true });
```

## [batchSet] api , merge setters into a watchable batch

> Notice❗️setProp Api's priority is higher than batchSet.
> Means if an setProp invoke in batchSet，
> whether setterWatcher will trigger depends on setProp.

```typescript

import { BATCH, batchSet } from 'watchable-proxy';
const p = watchable({ 
  value: 10, 
  sub: {
		str: 'foo',    
  },
});

const handleP = batchSet(() => {
  p.value = 20;
  p.sub.str = 'baz';
}, {
  // in this function changes of p and p's subProp
  // will be merged
  proxies: [p]
});

function batchWatcher() { }
watch(p, BATCH, batchWatcher);

function setterWatcher() { }
watch(p, ['value', 'sub.str'], setterWatcher);

// batchWatcher call 1 times
// setterWatcher call 0 times
handleP();
```

## [cloneWatchable] and [cloneRaw] api

```typescript
const p = watchable({
  a: 10,
  b: { v: 20 }
})

// deepCone, got a new irrelevant proxy 
const cloned = cloneWatchable(p);

// deepCone, got a new irrelevant raw object 
const clonedRaw = cloneRaw(p);
```

# "watchable proxy" specific

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

## "this" of a function property

#### "this" of array's method

```typescript
// if the method is belong to an array,
// "this" will always bind to "proxy receiver" 
// to make sure array's operator like "push" "splice"
// can be watched correctly;
const arr =  watchable([0,1,2]);
push = arr.push;

function watcher() { }
watch(arr, ['__$_batch'], watcher);

// watcher can be triggered
push(3);
```

#### "this" of function belongs to a literal object or instance of a class

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

