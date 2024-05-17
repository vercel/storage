---
"@vercel/kv": major
---

We're making this a major release for safety but we believe
most applications can upgrade from 1.0.1 to 2 without any changes.
Auto pipelining should work by default and improve performance.

BREAKING CHANGE: Auto pipelining is on by default now, see
https://upstash.com/docs/oss/sdks/ts/redis/pipelining/auto-pipeline. This
brings performance benefits to any code making multiple redis commands
simultaneously.

If you detect bugs because of this, please open them at
https://github.com/vercel/storage/issues.

You can disable this new behavior with:
```js
import { createClient } from '@vercel/kv';

const kv = createClient({
  url: ..,
  token: ..,
  enableAutoPipelining: false
});
```
