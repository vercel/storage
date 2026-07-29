---
'@vercel/blob': minor
---

Add image optimization support: a new `optimizeImage` option on `put` and a new `putFromUrl` method. Both optimize the image through Vercel Image Optimization before storing it (only the optimized output is stored) and require OIDC authentication.

```ts
const result = await put('avatars/foo.webp', body, {
  access: 'public',
  optimizeImage: { width: 128, quality: 75, format: 'webp' },
});

const result = await putFromUrl('avatars/foo.webp', 'https://example.com/photo.jpg', {
  access: 'public',
  optimizeImage: { width: 128, quality: 75, format: 'webp' },
});
```
