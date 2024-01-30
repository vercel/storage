---
"@vercel/edge-config": major
---

 - **Return values are now read-only to improve in-memory caching**

   In addition to the read-only change, the `@vercel/edge-config` package now also exports a `clone` function that can be used to make the read-only values modifiable again. Applications that used to modify the return value must now clone the value before doing the required changes.

   ```typescript
    import { get, clone } from '@vercel/edge-config';

    const myArray = await get('listOfAllowedIPs');
    // myArray.push('127.0.0.1'); // This won't work and might throw an error
    const myArrayClone = clone(myArray); // Clones the data to make it modifiable
    myArrayClone.push('127.0.0.1');
   ```

 - **Use stale-while-revalidate during development**

   When `@vercel/edge-config` is used during development, with `NODE_ENV` being set to `development`, the most recent result will be kept in-memory and returned instead of waiting for another network request to complete. In the background, a new request will then be started to ensure the in-memory data gets updated.
   This behaviour can be changed by setting the environment variable `EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR` to `1`, or by using the `disableDevelopmentCache` option on the `createClient` function.

 - **Genric catch-all errors are not thrown anymore**

   Previous versions of the `@vercel/edge-config` package used to catch most errors thrown by native functions and replace them with a generic error. The new version will not replace the native errors. **Note** that applications that relied on the `@vercel/edge-config: Unexpected error` and `@vercel/edge-config: Network error` errors must adapt to the new implementation.
