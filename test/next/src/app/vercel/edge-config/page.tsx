import Link from 'next/link';

export default function Page(): JSX.Element {
  return (
    <div>
      <h2>Issues</h2>
      <div>
        <Link href="/vercel/edge-config/issue-119">Issue 119</Link>
      </div>
    </div>
  );
}
