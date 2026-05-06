import {
  issueSignedToken,
  presignUrl,
  publicBlobObjectUrl,
} from '@vercel/blob';
import { NextResponse } from 'next/server';

function parseBlobObjectUrl(
  blobUrl: string,
): { access: 'public' | 'private'; pathname: string } | null {
  let u: URL;
  try {
    u = new URL(blobUrl);
  } catch {
    return null;
  }
  const { hostname } = u;
  if (hostname.endsWith('.public.blob.vercel-storage.com')) {
    return { access: 'public', pathname: pathnameFromObjectUrl(u.pathname) };
  }
  if (hostname.endsWith('.private.blob.vercel-storage.com')) {
    return { access: 'private', pathname: pathnameFromObjectUrl(u.pathname) };
  }
  return null;
}

function pathnameFromObjectUrl(urlPathname: string): string {
  const trimmed = urlPathname.startsWith('/')
    ? urlPathname.slice(1)
    : urlPathname;
  return trimmed
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { url?: string };
  if (!body.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const parsed = parseBlobObjectUrl(body.url);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'url must be a Vercel Blob object URL (*.public|*.private.blob.vercel-storage.com)',
      },
      { status: 400 },
    );
  }

  try {
    const issued = await issueSignedToken({
      pathname: parsed.pathname,
      operations: ['get'],
      ttlSeconds: 60 * 60,
    });
    const objectUrl = publicBlobObjectUrl(
      parsed.access,
      parsed.pathname,
      issued.delegationToken,
    );
    const presignedUrl = await presignUrl(objectUrl, issued, 'get');
    return NextResponse.json({ presignedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
