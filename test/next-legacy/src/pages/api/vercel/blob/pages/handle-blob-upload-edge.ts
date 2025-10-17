import { handleUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export default handleUploadHandler;

export const config = {
  runtime: 'edge',
};
