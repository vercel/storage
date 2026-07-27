/**
 * `head` error handling, `list` shaping, and the abort-signal forwarding that
 * lets a cancelled turn cancel the in-flight Blob request.
 */

import type { Interceptable, MockAgent } from 'undici';
import { BlobRequestAbortedError } from '../../src/api';
import {
  BLOB_API_URL_AGENT,
  BLOB_STORE_BASE_URL,
  copyTool,
  createFolderTool,
  delTool,
  getTool,
  headTool,
  listTool,
  putTool,
  renameTool,
  setupMockAgent,
  toolContext,
} from './harness';

const UPLOADED_AT = '2023-05-04T15:12:07.818Z';

const mockedFileMeta = {
  url: `${BLOB_STORE_BASE_URL}/foo-id.txt`,
  downloadUrl: `${BLOB_STORE_BASE_URL}/foo-id.txt?download=1`,
  size: 12345,
  uploadedAt: UPLOADED_AT,
  pathname: 'foo.txt',
  contentType: 'text/plain',
  contentDisposition: 'attachment; filename="foo.txt"',
  etag: '"abc123"',
};

describe('head tool', () => {
  let mockAgent: MockAgent;
  let apiClient: Interceptable;

  beforeEach(() => {
    mockAgent = setupMockAgent();
    apiClient = mockAgent.get(BLOB_API_URL_AGENT);
  });

  async function run(): Promise<Record<string, unknown>> {
    return (await headTool.execute(
      { urlOrPathname: `${BLOB_STORE_BASE_URL}/foo-id.txt` },
      toolContext(),
    )) as Record<string, unknown>;
  }

  it('returns metadata with uploadedAt as an ISO string', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(200, mockedFileMeta);

    const result = await run();

    expect(result).toEqual({
      url: mockedFileMeta.url,
      downloadUrl: mockedFileMeta.downloadUrl,
      pathname: 'foo.txt',
      size: 12345,
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="foo.txt"',
      cacheControl: undefined,
      uploadedAt: UPLOADED_AT,
      etag: '"abc123"',
    });
    expect(typeof result.uploadedAt).toBe('string');
  });

  it('reports a missing blob as found: false', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(404, { error: { code: 'not_found', message: 'Not found' } });

    await expect(run()).resolves.toEqual({ found: false });
  });

  // The `catch` in head must only swallow BlobNotFoundError. If it ever widens
  // to a bare `return { found: false }`, an auth failure would be reported to
  // the model as "the blob does not exist".
  it('still throws on a non-404 failure', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(403, { error: { code: 'forbidden' } });

    await expect(run()).rejects.toThrow(
      'Vercel Blob: Access denied, please provide a valid token for this resource.',
    );
  });

  it('still throws on a server error', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(500, 'Invalid token');

    await expect(run()).rejects.toThrow(
      'Vercel Blob: Unknown error, please visit https://vercel.com/help.',
    );
  });
});

describe('list tool', () => {
  let mockAgent: MockAgent;
  let apiClient: Interceptable;

  beforeEach(() => {
    mockAgent = setupMockAgent();
    apiClient = mockAgent.get(BLOB_API_URL_AGENT);
  });

  const listedBlob = {
    url: mockedFileMeta.url,
    downloadUrl: mockedFileMeta.downloadUrl,
    pathname: mockedFileMeta.pathname,
    size: mockedFileMeta.size,
    uploadedAt: UPLOADED_AT,
    etag: mockedFileMeta.etag,
  };

  async function run(
    input: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return (await listTool.execute(
      input as Parameters<typeof listTool.execute>[0],
      toolContext(),
    )) as Record<string, unknown>;
  }

  it('surfaces folders in folded mode', async () => {
    let path: string | null = null;
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(200, (req) => {
        path = req.path;
        return {
          blobs: [listedBlob],
          folders: ['foo/', 'bar/'],
          hasMore: false,
        };
      });

    const result = await run({ mode: 'folded' });

    expect(result.folders).toEqual(['foo/', 'bar/']);
    expect(path).toBe('/api/blob?mode=folded');
  });

  it('leaves folders undefined in expanded mode', async () => {
    apiClient.intercept({ path: () => true, method: 'GET' }).reply(200, {
      blobs: [listedBlob],
      cursor: 'cursor-123',
      hasMore: true,
    });

    const result = await run({ mode: 'expanded' });

    expect(result.folders).toBeUndefined();
    expect(result.cursor).toBe('cursor-123');
    expect(result.hasMore).toBe(true);
  });

  // eve tool output must be JSON-serialisable; the SDK hands back a Date.
  it('converts uploadedAt to an ISO string', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(200, { blobs: [listedBlob], hasMore: false });

    const result = await run();
    const blobs = result.blobs as Record<string, unknown>[];

    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.uploadedAt).toBe(UPLOADED_AT);
    expect(typeof blobs[0]?.uploadedAt).toBe('string');
    expect(blobs[0]?.uploadedAt).not.toBeInstanceOf(Date);
    expect(blobs[0]).toEqual({
      url: listedBlob.url,
      downloadUrl: listedBlob.downloadUrl,
      pathname: 'foo.txt',
      size: 12345,
      uploadedAt: UPLOADED_AT,
      etag: '"abc123"',
    });
  });
});

/**
 * The point of threading `ctx.abortSignal` through `blobCommandOptions` is that
 * cancelling a turn cancels the HTTP request. Each case below registers an
 * interceptor that *would* succeed, so dropping the signal turns these from
 * rejections into resolutions.
 */
describe('abortSignal forwarding', () => {
  let mockAgent: MockAgent;
  let apiClient: Interceptable;

  beforeEach(() => {
    mockAgent = setupMockAgent();
    apiClient = mockAgent.get(BLOB_API_URL_AGENT);
  });

  type ToolRun = (ctx: ReturnType<typeof toolContext>) => Promise<unknown>;

  const apiBackedTools: [string, ToolRun][] = [
    [
      'put',
      async (ctx) =>
        putTool.execute(
          { pathname: 'foo.txt', body: 'hello', access: 'public' },
          ctx,
        ),
    ],
    [
      'copy',
      async (ctx) =>
        copyTool.execute(
          {
            fromUrlOrPathname: 'foo.txt',
            toPathname: 'bar.txt',
            access: 'public',
          },
          ctx,
        ),
    ],
    [
      'rename',
      async (ctx) =>
        renameTool.execute(
          {
            fromUrlOrPathname: 'foo.txt',
            toPathname: 'bar.txt',
            access: 'public',
          },
          ctx,
        ),
    ],
    [
      'del',
      async (ctx) =>
        delTool.execute(
          { urlOrPathname: [`${BLOB_STORE_BASE_URL}/foo.txt`] },
          ctx,
        ),
    ],
    [
      'head',
      async (ctx) => headTool.execute({ urlOrPathname: 'foo.txt' }, ctx),
    ],
    ['list', async (ctx) => listTool.execute({}, ctx)],
    [
      'create_folder',
      async (ctx) => createFolderTool.execute({ pathname: 'reports/' }, ctx),
    ],
  ];

  it.each(
    apiBackedTools,
  )('%s aborts its request when the turn is cancelled', async (_name, run) => {
    apiClient
      .intercept({ path: () => true, method: () => true })
      .reply(200, mockedFileMeta)
      .delay(500)
      .persist();

    const controller = new AbortController();
    const promise = run(toolContext(controller.signal));
    controller.abort();

    await expect(promise).rejects.toThrow(BlobRequestAbortedError);
  });

  it('list resolves normally when the turn is not cancelled', async () => {
    apiClient
      .intercept({ path: () => true, method: 'GET' })
      .reply(200, { blobs: [], hasMore: false });

    await expect(
      Promise.resolve(listTool.execute({}, toolContext())),
    ).resolves.toMatchObject({ hasMore: false });
  });

  // `get` streams straight from the store host rather than going through
  // src/api.ts, so it surfaces the raw fetch abort instead of BlobRequestAbortedError.
  it('get aborts its download when the turn is cancelled', async () => {
    const storeClient = mockAgent.get(BLOB_STORE_BASE_URL);
    storeClient
      .intercept({ path: '/foo.txt', method: 'GET' })
      .reply(200, 'hello', { headers: { 'content-type': 'text/plain' } })
      .delay(500)
      .persist();

    const controller = new AbortController();
    const promise = Promise.resolve(
      getTool.execute(
        {
          urlOrPathname: `${BLOB_STORE_BASE_URL}/foo.txt`,
          access: 'public',
        },
        toolContext(controller.signal),
      ),
    );
    controller.abort();

    await expect(promise).rejects.toThrow(/abort/i);
  });

  it('get resolves normally when the turn is not cancelled', async () => {
    const storeClient = mockAgent.get(BLOB_STORE_BASE_URL);
    storeClient
      .intercept({ path: '/foo.txt', method: 'GET' })
      .reply(200, 'hello', {
        headers: { 'content-type': 'text/plain', 'content-length': '5' },
      });

    await expect(
      Promise.resolve(
        getTool.execute(
          {
            urlOrPathname: `${BLOB_STORE_BASE_URL}/foo.txt`,
            access: 'public',
          },
          toolContext(),
        ),
      ),
    ).resolves.toMatchObject({ text: 'hello' });
  });
});
