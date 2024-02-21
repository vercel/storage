'use client';

import { FormBodyUpload } from '../../../form-body-upload';

export default function AppFormDataServerless(): JSX.Element {
  return (
    <>
      <h1 className="text-xl mb-4">
        App Router direct body upload example via a Serverless Function
      </h1>
      <p>
        This <a href="https://nextjs.org/docs/app">Next.js App Router</a>{' '}
        example uses a{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form">
          Form
        </a>{' '}
        to send data via the{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/API/fetch">
          Fetch API
        </a>
        to a{' '}
        <a href="https://vercel.com/docs/concepts/functions/serverless-functions">
          Serverless Function
        </a>
        .
      </p>
      <p>
        Note: When deployed on Vercel, there&apos;s a 4.5 MB file upload limit.
      </p>
      <FormBodyUpload action="/vercel/blob/api/app/body/serverless" />
    </>
  );
}
