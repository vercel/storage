import Link from 'next/link';

export default function Page(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
      }}
    >
      <h2>App Links</h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'stretch',
        }}
      >
        <Link href="/vercel/edge-config">Edge Config</Link>
        <Link href="/vercel/kv">KV</Link>
        <Link href="/vercel/postgres">Postgres</Link>
        <Link href="/vercel/postgres-kysely">Postgres Kysely</Link>
        <Link href="/vercel/blob">Blob</Link>
      </div>
      <h2>Page Links</h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'stretch',
        }}
      >
        <Link href="/vercel/pages/blob">Blob</Link>
        <Link href="/vercel/pages/blob/image">Blob Image</Link>
      </div>
    </div>
  );
}
