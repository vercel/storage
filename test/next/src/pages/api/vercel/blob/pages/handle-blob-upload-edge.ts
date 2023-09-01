import { handleClientUploadHandler } from '@/app/vercel/blob/handle-blob-upload';

export default handleClientUploadHandler;

export const config = {
  runtime: 'edge',
};
