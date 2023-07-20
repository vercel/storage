import { error } from '@sveltejs/kit';
import { handleBlobUpload } from '@vercel/blob';

export const POST = async ({ request }) => {
  const body = await request.json();
  try {
    const jsonResponse = await handleBlobUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Step 1. Generate a client token for the browser to upload the file

        // ⚠️ Authenticate users before reaching this point.
        // Otherwise, you're allowing anonymous uploads.
        // const { user, userCanUpload } = await auth(request, pathname);
        // if (!userCanUpload) {
        //   throw new Error('not authenticated or bad pathname');
        // }

        return {
          // allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif'],
          // metadata: JSON.stringify({
          //   // optional, sent to your server on upload completion
          //   userId: user.id,
          // }),
        };
      },
      onUploadCompleted: async ({ blob, metadata }) => {
        // Step 3. Get notified of browser upload completion

        try {
          // Run any logic after the file upload completed
          // const parsedMetadata = JSON.parse(metadata);
          // await db.update({ avatar: blob.url, userId: parsedMetadata.userId });
        } catch (error) {
          throw new Error('Could not update user');
        }
      },
    });

    return new Response(JSON.stringify(jsonResponse));
  } catch (e) {
    throw error(400, {
      message: (e as Error).message,
    });
  }
};
