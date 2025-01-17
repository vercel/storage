---
'@vercel/blob': patch
---

fix(blob): allow client uploads in web workers

Before this change, we had guards so client uploads could only be used in
browser environments, this prevented customers to use Vercel Blob in Web
Workers, sometimes React Native or in general anywhere window is not really what
we think it is.
