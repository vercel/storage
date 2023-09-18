export const dynamic = 'force-dynamic';

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="flex gap-2">
        <a href="/">← Home</a> <a href="/vercel/blob">← Blob</a>
      </div>
      {children}
    </div>
  );
}
