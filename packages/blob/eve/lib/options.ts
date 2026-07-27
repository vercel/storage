import type { ToolContext } from 'eve/tools';

import type { BlobCommandOptions } from '../../src/helpers.js';

import extension from '../extension.js';

/**
 * Store credentials from the extension config plus the turn's abort signal, so
 * that cancelling a turn also cancels the in-flight Blob HTTP request.
 */
export function blobCommandOptions(ctx: ToolContext): BlobCommandOptions {
  const { token, storeId, oidcToken } = extension.config;

  return {
    abortSignal: ctx.abortSignal,
    ...(token !== undefined ? { token } : {}),
    ...(storeId !== undefined ? { storeId } : {}),
    ...(oidcToken !== undefined ? { oidcToken } : {}),
  };
}
