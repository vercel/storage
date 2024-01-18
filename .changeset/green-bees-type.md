---
"@vercel/blob": minor
---

feat(blob): add retry to all blob requests

This change generalizes the way we request the internal Blob API. This moves api version, authorization, response validation and error handling all into one place. 
Also this adds a retry mechanism to the API requests
