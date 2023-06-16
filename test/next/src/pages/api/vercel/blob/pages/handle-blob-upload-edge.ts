import { handleBlobUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export default handleBlobUploadHandler;

export const config = {
  runtime: 'edge',
};
