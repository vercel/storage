---
"@vercel/postgres": major
---

Upgrade underlying @neondatabase/serverless to 0.9.3.
We follow @neondatabase/serverless's versioning scheme, thus the major bump.

The main changes, per https://github.com/neondatabase/serverless/blob/main/CHANGELOG.md, are:
> - Use a single (per-region) domain name for all connections to Neon databases. Intended to help with connection caching in V8. Passes the endpoint ID inside connection options for WebSocket connections.
> - Deprecate fetchConnectionCache option, which is now always enabled. For neon http fetch queries, enable setting options on individual queries within a batch transaction (but note that the types still do not allow this).
> - Pass username (and database name) through URL decoder, so all usernames can successfully authorize.

Upgrading to this version should be safe for all users.

Also fixes #701
