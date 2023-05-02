import Link from 'next/link';

export default async function Page(): Promise<JSX.Element> {
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
      </div>
    </div>
  );
}
