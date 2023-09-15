---
'@vercel/blob': patch
---

Fix types for old module resolution. Before this commit types for the main package would be imported with a dot in the import path on autocompletion.
