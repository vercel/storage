import { handleClientUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export const POST = handleClientUploadHandler;

export const runtime = 'edge';
