import { defineTool } from 'eve/tools';
import { z } from 'zod';

import { createFolder } from '../../src/create-folder.js';
import { blobCommandOptions } from '../lib/options.js';

export default defineTool({
  description:
    'Create a folder marker in the store. Folder pathnames end with a trailing slash.',
  inputSchema: z.object({
    pathname: z
      .string()
      .describe('Folder pathname, for example reports/ or reports/2026/.'),
    access: z
      .enum(['public', 'private'])
      .optional()
      .describe('Folder access. Defaults to public.'),
  }),
  async execute({ pathname, access }, ctx) {
    const result = await createFolder(pathname, {
      ...blobCommandOptions(ctx),
      ...(access !== undefined ? { access } : {}),
    });

    return {
      pathname: result.pathname,
      url: result.url,
    };
  },
});
