import { handleUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export const POST = handleUploadHandler;

export const runtime = 'edge';
