import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import { putImage } from './index';

const BLOB_API_URL_AGENT = 'https://vercel.com';
const BLOB_STORE_BASE_URL = 'https://storeId.public.blob.vercel-storage.com';

const mockedOptimizedBlob = {
  url: `${BLOB_STORE_BASE_URL}/avatar-id.webp`,
  downloadUrl: `${BLOB_STORE_BASE_URL}/avatar-id.webp?download=1`,
  pathname: 'avatar.webp',
  contentType: 'image/webp',
  contentDisposition: 'inline; filename="avatar.webp"',
  etag: '"abc123"',
};

describe('putImage', () => {
  let mockClient: Interceptable;

  beforeEach(() => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN =
      'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    mockClient = mockAgent.get(BLOB_API_URL_AGENT);
    jest.resetAllMocks();

    process.env.VERCEL_BLOB_RETRIES = '0';
  });

  describe('body source', () => {
    it('sends a POST to /put-optimized with the optimize params and body', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      let body = '';
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          body = req.body as string;
          return mockedOptimizedBlob;
        });

      await expect(
        putImage('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128, quality: 80, format: 'webp' },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);

      expect(path).toBe(
        '/api/blob/put-optimized?pathname=avatar.webp&width=128&quality=80&format=image%2Fwebp',
      );
      expect(headers['x-vercel-blob-access']).toBe('public');
      expect(body).toBe('image-bytes');
    });

    it('treats a non-URL string as body content', async () => {
      let path: string | null = null;
      let body = '';
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          body = req.body as string;
          return mockedOptimizedBlob;
        });

      await putImage('avatar.webp', 'not a url', {
        access: 'public',
        optimizeImage: { width: 128 },
      });

      expect(path).toBe(
        '/api/blob/put-optimized?pathname=avatar.webp&width=128&quality=75',
      );
      expect(body).toBe('not a url');
    });

    it('forwards put headers like addRandomSuffix and cacheControlMaxAge', async () => {
      let headers: Record<string, string> = {};
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          headers = req.headers as Record<string, string>;
          return mockedOptimizedBlob;
        });

      await putImage('avatar.webp', 'image-bytes', {
        access: 'public',
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
        optimizeImage: { width: 128 },
      });

      expect(headers['x-add-random-suffix']).toBe('1');
      expect(headers['x-cache-control-max-age']).toBe('60');
    });

    it('throws when the contentType option is not an image', async () => {
      await expect(
        putImage('avatar.webp', 'not-an-image', {
          access: 'public',
          contentType: 'text/plain',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage requires an image body, but the content type is "text/plain"',
      );
    });
  });

  describe('URL source', () => {
    it('sends a POST to /put-from-url when the source is an http(s) URL', async () => {
      let path: string | null = null;
      let headers: Record<string, string> = {};
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          headers = req.headers as Record<string, string>;
          return mockedOptimizedBlob;
        });

      await expect(
        putImage('avatar.webp', 'https://example.com/image.jpg', {
          access: 'public',
          optimizeImage: { width: 128, quality: 80, format: 'webp' },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);

      expect(path).toBe(
        '/api/blob/put-from-url?pathname=avatar.webp&url=https%3A%2F%2Fexample.com%2Fimage.jpg&width=128&quality=80&format=image%2Fwebp',
      );
      expect(headers['x-vercel-blob-access']).toBe('public');
    });

    it('detects the URL scheme case-insensitively', async () => {
      let path: string | null = null;
      mockClient
        .intercept({
          path: () => true,
          method: 'POST',
        })
        .reply(200, (req) => {
          path = req.path;
          return mockedOptimizedBlob;
        });

      await putImage('avatar.webp', 'HTTP://example.com/image.jpg', {
        access: 'public',
        optimizeImage: { width: 128 },
      });

      expect(path).toContain('/api/blob/put-from-url?');
    });

    it('throws when contentType is combined with a URL source', async () => {
      await expect(
        putImage('avatar.webp', 'https://example.com/image.jpg', {
          access: 'public',
          contentType: 'image/jpeg',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: contentType is not supported when the source is a URL',
      );
    });
  });

  describe('validation', () => {
    it('throws when optimizeImage is missing', async () => {
      await expect(
        putImage(
          'avatar.webp',
          'image-bytes',
          // @ts-expect-error -- exercising the runtime guard for JS callers
          { access: 'public' },
        ),
      ).rejects.toThrow('Vercel Blob: optimizeImage is required, see usage');
    });

    it('validates optimize params for both source kinds', async () => {
      await expect(
        putImage('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 8193 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.width must be an integer between 1 and 8192',
      );
      await expect(
        putImage('avatar.webp', 'https://example.com/image.jpg', {
          access: 'public',
          optimizeImage: { width: 128, quality: 200 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.quality must be an integer between 1 and 100',
      );
    });
  });
});
