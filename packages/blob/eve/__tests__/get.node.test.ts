/**
 * Branching in the `get` tool: what gets inlined into the model's context,
 * what gets omitted, and how misses / conditional requests are reported.
 */

import type { Interceptable, MockAgent } from 'undici';
import {
  BLOB_STORE_BASE_URL,
  getTool,
  setupMockAgent,
  toolContext,
} from './harness';

const LAST_MODIFIED = 'Thu, 04 May 2023 15:12:07 GMT';
const MAX_INLINE_TEXT_BYTES = 64 * 1024;

type GetOutput = Awaited<ReturnType<typeof getTool.execute>> &
  Record<string, unknown>;

describe('get tool', () => {
  let mockAgent: MockAgent;
  let storeClient: Interceptable;

  beforeEach(() => {
    mockAgent = setupMockAgent();
    storeClient = mockAgent.get(BLOB_STORE_BASE_URL);
  });

  function replyWith(
    body: string,
    contentType: string,
    { size = body.length }: { size?: number } = {},
  ): void {
    storeClient
      .intercept({ path: '/foo.txt', method: 'GET' })
      .reply(200, body, {
        headers: {
          'content-type': contentType,
          'content-length': String(size),
          'last-modified': LAST_MODIFIED,
          etag: '"abc123"',
          'cache-control': 'public, max-age=31536000',
          'content-disposition': 'inline; filename="foo.txt"',
        },
      });
  }

  async function run(
    input: Partial<Parameters<typeof getTool.execute>[0]> = {},
  ): Promise<GetOutput> {
    return (await getTool.execute(
      {
        urlOrPathname: `${BLOB_STORE_BASE_URL}/foo.txt`,
        access: 'public',
        ...input,
      },
      toolContext(),
    )) as GetOutput;
  }

  it('inlines small text payloads', async () => {
    replyWith('hello world', 'text/plain');

    const result = await run();

    expect(result.text).toBe('hello world');
    expect(result.inlineTextOmitted).toBeUndefined();
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe('text/plain');
    expect(result.size).toBe(11);
    expect(result.url).toBe(`${BLOB_STORE_BASE_URL}/foo.txt`);
    expect(result.downloadUrl).toBe(
      `${BLOB_STORE_BASE_URL}/foo.txt?download=1`,
    );
    expect(result.pathname).toBe('foo.txt');
    expect(result.etag).toBe('"abc123"');
    // eve tool output has to be JSON-serialisable, so this must be a string.
    expect(typeof result.uploadedAt).toBe('string');
    expect(result.uploadedAt).toBe(new Date(LAST_MODIFIED).toISOString());
  });

  it('inlines small JSON payloads', async () => {
    replyWith('{"a":1}', 'application/json');

    const result = await run();

    expect(result.text).toBe('{"a":1}');
    expect(result.inlineTextOmitted).toBeUndefined();
  });

  // A content-type header may carry parameters and is case-insensitive, so the
  // media type has to be matched on its own rather than compared verbatim.
  it.each([
    ['application/json; charset=utf-8', '{"a":1}'],
    ['application/json;charset=UTF-8', '{"a":1}'],
    ['text/plain; charset=utf-8', 'hello'],
    ['Application/JSON', '{"a":1}'],
    ['TEXT/PLAIN', 'hello'],
    ['application/ld+json', '{"@id":"x"}'],
  ])('inlines %s', async (contentType, body) => {
    replyWith(body, contentType);

    const result = await run();

    expect(result.text).toBe(body);
    expect(result.inlineTextOmitted).toBeUndefined();
  });

  it.each([
    ['image/png'],
    ['application/octet-stream'],
    ['application/json-seq'],
  ])('still omits %s', async (contentType) => {
    replyWith('not inlined', contentType);

    const result = await run();

    expect(result.text).toBeUndefined();
    expect(result.inlineTextOmitted).toBe(true);
  });

  it('inlines a text payload sitting exactly on the 64 KiB ceiling', async () => {
    const body = 'a'.repeat(MAX_INLINE_TEXT_BYTES);
    replyWith(body, 'text/plain');

    const result = await run();

    expect(result.size).toBe(MAX_INLINE_TEXT_BYTES);
    expect(result.text).toBe(body);
    expect(result.inlineTextOmitted).toBeUndefined();
  });

  /** Replies without a `content-length` header, as a chunked response would. */
  function replyWithoutContentLength(body: string, contentType: string): void {
    storeClient
      .intercept({ path: '/foo.txt', method: 'GET' })
      .reply(200, body, {
        headers: {
          'content-type': contentType,
          'last-modified': LAST_MODIFIED,
          etag: '"abc123"',
          'cache-control': 'public, max-age=31536000',
          'content-disposition': 'inline; filename="foo.txt"',
        },
      });
  }

  // Regression: `blob.size` is populated from `content-length`, which `get()`
  // reports as 0 when the header is absent. Gating inlining on that value alone
  // let a body of any size straight into the model's context.
  it('omits an oversized body that arrives without content-length', async () => {
    replyWithoutContentLength('a'.repeat(200 * 1024), 'text/plain');

    const result = await run();

    expect(result.size).toBe(0);
    expect(result.text).toBeUndefined();
    expect(result.inlineTextOmitted).toBe(true);
  });

  it('still inlines a small body that arrives without content-length', async () => {
    replyWithoutContentLength('hello world', 'text/plain');

    const result = await run();

    expect(result.size).toBe(0);
    expect(result.text).toBe('hello world');
    expect(result.inlineTextOmitted).toBeUndefined();
  });

  it('counts multi-byte characters as bytes, not code units', async () => {
    // 'é' is 2 bytes in UTF-8, so this is ~128 KiB on the wire while
    // `String.length` reports only 64 KiB worth of code units.
    replyWithoutContentLength('é'.repeat(MAX_INLINE_TEXT_BYTES), 'text/plain');

    const result = await run();

    expect(result.text).toBeUndefined();
    expect(result.inlineTextOmitted).toBe(true);
  });

  it('omits text one byte over the 64 KiB ceiling', async () => {
    const body = 'a'.repeat(MAX_INLINE_TEXT_BYTES + 1);
    replyWith(body, 'text/plain');

    const result = await run();

    expect(result.size).toBe(MAX_INLINE_TEXT_BYTES + 1);
    expect(result.text).toBeUndefined();
    expect(result.inlineTextOmitted).toBe(true);
    // Metadata still comes back so the model can hand off the URL.
    expect(result.url).toBe(`${BLOB_STORE_BASE_URL}/foo.txt`);
    expect(result.contentType).toBe('text/plain');
  });

  it('omits text for a non-inlineable content type even when small', async () => {
    replyWith('PNG fake bytes', 'image/png');

    const result = await run();

    expect(result.text).toBeUndefined();
    expect(result.inlineTextOmitted).toBe(true);
    expect(result.contentType).toBe('image/png');
    expect(result.size).toBeLessThan(MAX_INLINE_TEXT_BYTES);
  });

  it('reports a miss as found: false rather than throwing', async () => {
    storeClient.intercept({ path: '/foo.txt', method: 'GET' }).reply(404, '');

    await expect(run()).resolves.toEqual({ found: false });
  });

  it('reports a 304 as notModified with the etag and no body', async () => {
    storeClient.intercept({ path: '/foo.txt', method: 'GET' }).reply(304, '', {
      headers: {
        etag: '"abc123"',
        'last-modified': LAST_MODIFIED,
      },
    });

    const result = await run({ ifNoneMatch: '"abc123"' });

    expect(result).toEqual({
      statusCode: 304,
      notModified: true,
      etag: '"abc123"',
    });
  });

  it('sends the If-None-Match header supplied by the model', async () => {
    let sentHeaders: Record<string, string> = {};
    storeClient
      .intercept({ path: '/foo.txt', method: 'GET' })
      .reply(200, (req) => {
        sentHeaders = req.headers as Record<string, string>;
        return 'hello';
      });

    await run({ ifNoneMatch: '"etag-from-model"' });

    expect(sentHeaders['If-None-Match']).toBe('"etag-from-model"');
  });
});
