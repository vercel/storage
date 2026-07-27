import { defineTool } from 'eve/tools';
import { z } from 'zod';

import { get } from '../../src/get.js';
import { blobCommandOptions } from '../lib/options.js';

// Inlined text is spent straight out of the model's context window, so keep the
// ceiling small: 64 KiB is roughly 16k tokens.
const MAX_INLINE_TEXT_BYTES = 64 * 1024;

/**
 * Reads `stream` as UTF-8, or returns `null` when the body exceeds `maxBytes`.
 *
 * The size reported on the blob comes from `content-length`, which `get()`
 * records as `0` when the header is absent (chunked or streamed responses, more
 * likely on `useCache: false` origin reads). Gating only on that value would let
 * a body of any size through, so the real byte count is enforced here while
 * reading. Reading incrementally also avoids buffering an unbounded body into
 * memory just to reject it.
 */
async function readTextWithinBudget(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export default defineTool({
  description:
    'Download a blob by URL or pathname. Returns inline text for text or JSON payloads up to 64 KiB; otherwise returns metadata and URLs only.',
  inputSchema: z.object({
    urlOrPathname: z.string().describe('Blob URL or pathname to download.'),
    access: z.enum(['public', 'private']).describe('Blob access level.'),
    useCache: z
      .boolean()
      .optional()
      .describe('When false, bypass CDN cache and read from origin.'),
    ifNoneMatch: z
      .string()
      .optional()
      .describe('Skip download when the blob etag still matches.'),
  }),
  async execute({ urlOrPathname, access, useCache, ifNoneMatch }, ctx) {
    const result = await get(urlOrPathname, {
      ...blobCommandOptions(ctx),
      access,
      ...(useCache !== undefined ? { useCache } : {}),
      ...(ifNoneMatch !== undefined ? { ifNoneMatch } : {}),
    });

    if (!result) {
      return { found: false };
    }

    if (result.statusCode === 304) {
      return {
        statusCode: 304,
        notModified: true,
        etag: result.blob.etag,
      };
    }

    const { stream, blob } = result;
    const base = {
      statusCode: result.statusCode,
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      pathname: blob.pathname,
      contentDisposition: blob.contentDisposition,
      cacheControl: blob.cacheControl,
      uploadedAt: blob.uploadedAt.toISOString(),
      etag: blob.etag,
      contentType: blob.contentType,
      size: blob.size,
    };

    const isInlineableType =
      blob.contentType.startsWith('text/') ||
      blob.contentType === 'application/json';

    // Fast path: when content-length already reports an oversized body, skip
    // the download entirely. Cancel the stream so the connection is released.
    if (!isInlineableType || blob.size > MAX_INLINE_TEXT_BYTES) {
      await stream.cancel().catch(() => undefined);

      return {
        ...base,
        text: undefined,
        inlineTextOmitted: true,
      };
    }

    const text = await readTextWithinBudget(stream, MAX_INLINE_TEXT_BYTES);

    if (text === null) {
      return {
        ...base,
        text: undefined,
        inlineTextOmitted: true,
      };
    }

    return {
      ...base,
      text,
    };
  },
});
