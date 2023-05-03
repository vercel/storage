import React from 'react';

export function ProjectDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gap: '8px',
        minHeight: '100vh',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      }}
    >
      {children}
    </div>
  );
}
