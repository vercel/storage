'use client';

import FormBodyUpload from '../../../form-body-upload';

export default function AppBodyEdge(): JSX.Element {
  return (
    <>
      <h1>App Router direct body upload example via an Edge Function</h1>
      <p>
        This{' '}
        <a href="https://beta.nextjs.org/docs/app-directory-roadmap">
          Next.js App Router
        </a>{' '}
        example uses a{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form">
          Form
        </a>{' '}
        to send data via the{' '}
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
      <FormBodyUpload action="/vercel/blob/api/app/body/edge" />
    </>
  );
}
