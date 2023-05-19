export const dynamic = 'force-dynamic';

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <a href="/">← Home</a>
      {children}
    </div>
  );
}
