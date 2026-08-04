import { type Interceptable, MockAgent, setGlobalDispatcher } from 'undici';
import { put, putFromUrl } from './index';

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

describe('optimizeImage', () => {
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

  describe('put with optimizeImage', () => {
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
        put('avatar.webp', 'image-bytes', {
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

    it('defaults quality to 75 and omits format when not provided', async () => {
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

      await put('avatar.webp', 'image-bytes', {
        access: 'public',
        optimizeImage: { width: 128 },
      });

      expect(path).toBe(
        '/api/blob/put-optimized?pathname=avatar.webp&width=128&quality=75',
      );
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

      await put('avatar.webp', 'image-bytes', {
        access: 'public',
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
        optimizeImage: { width: 128 },
      });

      expect(headers['x-add-random-suffix']).toBe('1');
      expect(headers['x-cache-control-max-age']).toBe('60');
    });

    it('throws when combined with multipart', async () => {
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          multipart: true,
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage cannot be combined with multipart uploads',
      );
    });
  });

  describe('optimizeImage validation', () => {
    it('throws when quality is greater than 100', async () => {
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128, quality: 101 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.quality must be an integer between 1 and 100',
      );
    });

    it('throws when quality is 0 or fractional', async () => {
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128, quality: 0 },
        }),
      ).rejects.toThrow('optimizeImage.quality');
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128, quality: 79.5 },
        }),
      ).rejects.toThrow('optimizeImage.quality');
    });

    it('throws when width is missing, out of range, or fractional', async () => {
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: {} as { width: number },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.width must be an integer between 1 and 8192',
      );
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 8193 },
        }),
      ).rejects.toThrow('optimizeImage.width');
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 0 },
        }),
      ).rejects.toThrow('optimizeImage.width');
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: { width: 128.5 },
        }),
      ).rejects.toThrow('optimizeImage.width');
    });

    it('throws on an unsupported format', async () => {
      await expect(
        put('avatar.webp', 'image-bytes', {
          access: 'public',
          optimizeImage: {
            width: 128,
            format: 'tiff' as unknown as 'webp',
          },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.format must be one of: jpeg, png, webp, avif',
      );
    });

    it('validates options for putFromUrl too', async () => {
      await expect(
        putFromUrl('avatar.webp', 'https://example.com/image.jpg', {
          access: 'public',
          optimizeImage: { width: 128, quality: 200 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage.quality must be an integer between 1 and 100',
      );
    });

    it('throws when the contentType option is not an image', async () => {
      await expect(
        put('avatar.webp', 'not-an-image', {
          access: 'public',
          contentType: 'text/plain',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage requires an image body, but the content type is "text/plain"',
      );
    });

    it('throws when a Blob body declares a non-image type', async () => {
      await expect(
        put('avatar.webp', new Blob(['<html></html>'], { type: 'text/html' }), {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: optimizeImage requires an image body, but the content type is "text/html"',
      );
    });

    it('accepts a Blob body with an image type', async () => {
      mockClient
        .intercept({ path: () => true, method: 'POST' })
        .reply(200, mockedOptimizedBlob);

      await expect(
        put('avatar.webp', new Blob(['bytes'], { type: 'image/png' }), {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);
    });

    it('leaves bodies without a content-type signal to the server', async () => {
      mockClient
        .intercept({ path: () => true, method: 'POST' })
        .reply(200, mockedOptimizedBlob);

      // A string body carries no type information, so no client-side check.
      await expect(
        put('avatar.webp', 'maybe-image-bytes', {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);
    });
  });

  describe('putFromUrl', () => {
    it('sends a POST to /put-from-url with the source url and optimize params', async () => {
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
        putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
          access: 'public',
          optimizeImage: { width: 128, quality: 80, format: 'webp' },
        }),
      ).resolves.toEqual(mockedOptimizedBlob);

      expect(path).toBe(
        '/api/blob/put-from-url?pathname=avatar.webp&url=https%3A%2F%2Fexample.com%2Fphoto.jpg&width=128&quality=80&format=image%2Fwebp',
      );
      expect(headers['x-vercel-blob-access']).toBe('public');
    });

    it('forwards addRandomSuffix, allowOverwrite and cacheControlMaxAge headers', async () => {
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

      await putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
        access: 'public',
        addRandomSuffix: true,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        optimizeImage: { width: 128 },
      });

      expect(headers['x-add-random-suffix']).toBe('1');
      expect(headers['x-allow-overwrite']).toBe('1');
      expect(headers['x-cache-control-max-age']).toBe('60');
    });

    it('sends x-if-match and implicitly allows overwrite when ifMatch is provided', async () => {
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

      await putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
        access: 'public',
        ifMatch: '"abc123"',
        optimizeImage: { width: 128 },
      });

      expect(headers['x-if-match']).toBe('"abc123"');
      expect(headers['x-allow-overwrite']).toBe('1');
    });

    it('throws when ifMatch is combined with allowOverwrite: false', async () => {
      await expect(
        putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
          access: 'public',
          ifMatch: '"abc123"',
          allowOverwrite: false,
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow(
        'Vercel Blob: ifMatch and allowOverwrite: false are contradictory.',
      );
    });

    it('throws when pathname is missing', async () => {
      await expect(
        putFromUrl('', 'https://example.com/photo.jpg', {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow('Vercel Blob: pathname is required');
    });

    it('throws when access is invalid', async () => {
      await expect(
        putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
          // @ts-expect-error -- testing runtime validation
          access: 'protected',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow('Vercel Blob: access must be "private" or "public"');
    });

    it('throws when url is missing', async () => {
      await expect(
        putFromUrl('avatar.webp', '', {
          access: 'public',
          optimizeImage: { width: 128 },
        }),
      ).rejects.toThrow('Vercel Blob: url is required');
    });

    it('throws when optimizeImage is missing', async () => {
      await expect(
        putFromUrl('avatar.webp', 'https://example.com/photo.jpg', {
          access: 'public',
          // @ts-expect-error -- testing runtime validation
          optimizeImage: undefined,
        }),
      ).rejects.toThrow('Vercel Blob: optimizeImage is required, see usage');
    });
  });
});
