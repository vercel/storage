import { defineTool } from 'eve/tools';
import { z } from 'zod';

import { copy } from '../../src/copy.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description: 'Copy a blob to a new pathname in the same store.',
  inputSchema: z.object({
    fromUrlOrPathname: z.string().describe('Source blob URL or pathname.'),
    toPathname: z
      .string()
      .describe('Destination pathname, including file extension.'),
    access: z.enum(['public', 'private']).describe('Access for the new blob.'),
    addRandomSuffix: z
      .boolean()
      .optional()
      .describe(
        'Append a random suffix to the destination pathname to avoid collisions.',
      ),
    allowOverwrite: z
      .boolean()
      .optional()
      .describe(
        'Allow replacing an existing blob at the destination pathname.',
      ),
    contentType: z
      .string()
      .optional()
      .describe(
        'Media type for the copied blob. Defaults from the destination pathname extension.',
      ),
    cacheControlMaxAge: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Cache lifetime in seconds for the copied blob.'),
  }),
  async execute(input, ctx) {
    const { fromUrlOrPathname, toPathname, access, ...options } = input;
    const result = await copy(fromUrlOrPathname, toPathname, {
      access,
      ...options,
      ...blobCommandOptions(ctx),
    });

    return {
      url: result.url,
      downloadUrl: result.downloadUrl,
      pathname: result.pathname,
      contentType: result.contentType,
      contentDisposition: result.contentDisposition,
      etag: result.etag,
    };
  },
});
