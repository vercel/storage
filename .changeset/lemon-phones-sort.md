---
"@vercel/edge-config": major
---

 - **BREAKING CHANGE** Return values are now read-only to improve in-memory caching

   It used to be possible to change the returned value as seen this example:

   ```typescript
    import { get } from '@vercel/edge-config';
    const countries = await get('allowedCountryCodes');
    countries.DE = true; // Won't be possible anymore and throw an error
   ```

   Moving forward, modifications like the above will cause an error.

   If there is a need to modify the value, then the `clone` function can be used to clone the data and make it modifiable.

   ```typescript
    import { get, clone } from '@vercel/edge-config';

    const myArray = await get('listOfAllowedIPs');
    const myArrayClone = clone(myArray); // Clones the data to make it modifiable
    myArrayClone.push('127.0.0.1'); // The `push` operation will work now
   ```

 - **BREAKING CHANGE** SDK now throws underlying errors

   Previous versions of the `@vercel/edge-config` package would catch most errors thrown by native functions and throw a generic network error instead - even if the underlying issue wasn't a network error. The new version will throw the original errors.
 
   **Note** applications which rely on the `@vercel/edge-config: Unexpected error` and `@vercel/edge-config: Network error` errors must adapt to the new implementation by ensuring other types of errors are handled as well.

 - The SDK now uses stale-while-revalidate semantics during development

   When `@vercel/edge-config` is used during development, with `NODE_ENV` being set to `development`, any read operation will fetch the entire Edge Config once and keep it in-memory to quickly resolve all other read operations for other keys, without waiting for the network. Subsequent will still initiate a network request to keep the in-memory data up-to-date in the background.

   This behaviour can be disabled by setting the environment variable `EDGE_CONFIG_DISABLE_DEVELOPMENT_SWR` to `1`, or by using the `disableDevelopmentCache` option on the `createClient` function.
