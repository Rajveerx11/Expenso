import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-labelledby="not-found-title"
      style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}
    >
      <div>
        <p style={{ fontSize: 48, marginBottom: 12 }} aria-hidden="true">404</p>
        <h1 id="not-found-title" style={{ fontSize: 24, marginBottom: 8 }}>Page not found</h1>
        <p style={{ color: 'var(--color-medium)', marginBottom: 18 }}>
          This Expenso page does not exist or is no longer available.
        </p>
        <Link className="btn btn-primary" href="/dashboard">Go to dashboard</Link>
      </div>
    </main>
  );
}
