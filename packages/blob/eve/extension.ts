import { defineExtension } from 'eve/extension';
import { z } from 'zod';

export default defineExtension({
  config: z.object({
    token: z
      .string()
      .optional()
      .describe(
        'Blob read-write token. Defaults to BLOB_READ_WRITE_TOKEN when omitted.',
      ),
    storeId: z
      .string()
      .optional()
      .describe(
        'Blob store id for Vercel OIDC auth. Defaults to BLOB_STORE_ID when omitted.',
      ),
  }),
});
