---
'@vercel/edge-config': major
---

change type generics in `get()` to no longer add undefined by default

If you were previously doing this

```js
const value = await get<string>("someKey")
```

Then `value` would be of type `string | undefined` as no key is guaranteed to exist.

Users would thus often fall back to eliminate the `undefined` type like so:

```js
const value = (await get<string>("someKey")) as string
```

With the latest change the generic no longer adds the `undefined` type by default.

```js
const value = await get<string>("someKey")
```

Now `value` will have a type of just `string`.

If you want the previous behaviour you need to explicitly add `undefined`

```js
const value = await get<string | undefined>("someKey")
```
