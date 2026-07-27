import { defineTool } from 'eve/tools';
import { z } from 'zod';

// `src/put.ts` only exports the `createPutMethod` factory, not a ready-made
// `put`, so this deliberately uses the package entry point rather than
// re-deriving the method and duplicating its `allowedOptions` list.
import { put } from '../../src/index.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description:
    'Upload UTF-8 text to Vercel Blob. For binary or large files, use the Blob SDK or client uploads.',
  inputSchema: z
    .object({
      pathname: z
        .string()
        .describe('Destination pathname, including file extension.'),
      body: z.string().describe('UTF-8 text content to upload.'),
      access: z.enum(['public', 'private']).describe('Blob access level.'),
      contentType: z
        .string()
        .optional()
        .describe('Media type. Defaults from the pathname extension.'),
      addRandomSuffix: z
        .boolean()
        .optional()
        .describe('Append a random suffix to avoid pathname collisions.'),
      allowOverwrite: z
        .boolean()
        .optional()
        .describe('Allow replacing an existing blob at the same pathname.'),
      cacheControlMaxAge: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Cache lifetime in seconds for the uploaded blob. Minimum 60. Defaults to one month.',
        ),
      ifMatch: z
        .string()
        .optional()
        .describe(
          'Overwrite only when the existing blob etag matches. Implies allowOverwrite.',
        ),
    })
    // `createPutHeaders` throws on this combination, so reject it at validation
    // time where the model gets an actionable message instead.
    .refine(
      (input) => input.ifMatch === undefined || input.allowOverwrite !== false,
      {
        error:
          'ifMatch performs a conditional overwrite, so it cannot be combined with allowOverwrite: false. Omit allowOverwrite, or set it to true.',
        path: ['allowOverwrite'],
      },
    ),
  async execute(input, ctx) {
    const { pathname, body, access, ...options } = input;
    const result = await put(pathname, body, {
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
