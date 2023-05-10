'use client';

import FormDataUpload from '../../../form-data-upload';

export default function AppFormDataEdge(): JSX.Element {
  return (
    <>
      <h1>App Router Form Data upload example via an Edge Function</h1>
      <p>
        This{' '}
        <a href="https://beta.nextjs.org/docs/app-directory-roadmap">
          Next.js App Router
        </a>{' '}
        example uses a{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form">
          Form
        </a>{' '}
        to send data as{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/API/FormData/FormData">
          FormData
        </a>{' '}
        via the{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/API/fetch">
          Fetch API
        </a>
        to an{' '}
        <a href="https://vercel.com/docs/concepts/functions/edge-functions">
          Edge Function
        </a>
        .
      </p>
      <p>
        Note: When deployed on Vercel, there&apos;s a 4MB file upload limit.
      </p>
      <FormDataUpload action="/vercel/blob/api/app/formdata/edge" />
    </>
  );
}