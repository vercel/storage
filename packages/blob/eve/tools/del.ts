import { defineTool } from 'eve/tools';
import { always } from 'eve/tools/approval';
import { z } from 'zod';

import { del } from '../../src/del.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description: 'Delete one or more blobs from the store by URL or pathname.',
  inputSchema: z
    .object({
      urlOrPathname: z
        .array(z.string())
        .min(1)
        .describe('Blob URLs or pathnames to delete.'),
      ifMatch: z
        .string()
        .optional()
        .describe(
          'Delete only when the blob etag matches. Only valid for a single target.',
        ),
    })
    .refine(
      (input) =>
        input.ifMatch === undefined || input.urlOrPathname.length === 1,
      {
        error:
          'ifMatch can only be used when deleting a single blob. Pass exactly one urlOrPathname, or omit ifMatch.',
        path: ['ifMatch'],
      },
    ),
  approval: always(),
  async execute({ urlOrPathname, ifMatch }, ctx) {
    await del(urlOrPathname, {
      ...blobCommandOptions(ctx),
      ...(ifMatch !== undefined ? { ifMatch } : {}),
    });

    return { deleted: urlOrPathname };
  },
});
