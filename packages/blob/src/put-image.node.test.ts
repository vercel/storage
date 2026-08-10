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

    it('treats any string as body content, even one that looks like a URL', async () => {
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

      await putImage('avatar.webp', 'https://example.com/image.jpg', {
        access: 'public',
        optimizeImage: { width: 128 },
      });

      expect(path).toBe(
        '/api/blob/put-optimized?pathname=avatar.webp&width=128&quality=75',
      );
      expect(body).toBe('https://example.com/image.jpg');
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

    it('throws when a Blob body declares a non-image type', async () => {
      await expect(
        putImage(
          'avatar.webp',
          new Blob(['<html></html>'], { type: 'text/html' }),
          {
            access: 'public',
            optimizeImage: { width: 128 },
          },
        ),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage requires an image body, but the content type is "text/html"',
      );
    });
  });

  describe('URL source', () => {
    it('sends a POST to /put-from-url when the source is a URL instance', async () => {
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
        putImage('avatar.webp', new URL('https://example.com/image.jpg'), {
          access: 'public',
          optimizeImage: { width: 128, quality: 80, format: 'webp' },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);

      expect(path).toBe(
        '/api/blob/put-from-url?pathname=avatar.webp&url=https%3A%2F%2Fexample.com%2Fimage.jpg&width=128&quality=80&format=image%2Fwebp',
      );
      expect(headers['x-vercel-blob-access']).toBe('public');
    });

    it('rejects a non-http(s) URL', async () => {
      await expect(
        putImage('avatar.webp', new URL('ftp://example.com/image.jpg'), {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: the source URL must use the http(s) protocol',
      );
    });

    it('rejects the contentType option at the type level', () => {
      // The stored content type always comes from the optimizer output, so
      // putImage does not accept contentType at all. Never invoked: this
      // test only pins the compile-time rejection.
      const invalid = () =>
        putImage('avatar.webp', 'image-bytes', {
          access: 'public',
          // @ts-expect-error -- contentType is not part of PutImageCommandOptions
          contentType: 'image/jpeg',
          optimizeImage: { width: 128 },
        });
      expect(typeof invalid).toBe('function');
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
        putImage('avatar.webp', new URL('https://example.com/image.jpg'), {
          access: 'public',
          optimizeImage: { width: 128, quality: 200 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.quality must be an integer between 1 and 100',
      );
      await expect(
        putImage('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128, format: 'tiff' as unknown as 'webp' },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.format must be one of: jpeg, png, webp',
      );
    });
  });
});
