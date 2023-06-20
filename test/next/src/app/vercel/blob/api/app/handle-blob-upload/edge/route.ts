import { handleBlobUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export const POST = handleBlobUploadHandler;

export const runtime = 'edge';
