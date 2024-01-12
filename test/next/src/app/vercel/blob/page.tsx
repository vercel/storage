export default function Home(): JSX.Element {
  return (
    <main>
      <h1 className="text-xl mb-4">
        Vercel Blob Next.js Examples (
        <a href="https://github.com/vercel/blob/tree/main/example">
          code on GitHub
        </a>
        )
      </h1>
      <p>
        Note: When deployed on Vercel, there&apos;s a 4.5 MB file upload limit
        for browsers.
      </p>
      <p>
        Node.js https.get, axios, and got examples can be found in the{' '}
        <a href="https://github.com/vercel/blob/tree/main/example/script.mts">
          vercel/blob GitHub repository
        </a>
        .
      </p>
      <h2>Next.js App Router</h2>
      <ul>
        <li>
          Form body upload | Edge →{' '}
          <a href="/vercel/blob/app/body/edge">/app/body/edge</a>
        </li>
        <li>
          Form body upload | Serverless →{' '}
          <a href="/vercel/blob/app/body/serverless">/app/body/serverless</a>
        </li>
        <li>
          Form Data upload | Edge →{' '}
          <a href="/vercel/blob/app/formdata/edge">/app/formdata/edge</a>
        </li>
        <li>
          Form Data upload | Serverless →{' '}
          <a href="/vercel/blob/app/formdata/serverless">
            /app/formdata/serverless
          </a>
        </li>
        <li>
          Client Upload → <a href="/vercel/blob/app/client">/app/client</a>
        </li>
        <li>
          Client Upload (multipart) →{' '}
          <a href="/vercel/blob/app/client-multipart">/app/client-multipart</a>
        </li>
        <li>
          List blob items → <a href="/vercel/blob/app/list">/app/list</a>
        </li>
      </ul>
      <h2>Next.js Pages</h2>
      <p>TODO</p>
    </main>
  );
}
