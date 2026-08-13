'use client';

export function SkeletonLine({ width = '100%', height = '16px', radius = '8px' }: { width?: string; height?: string; radius?: string }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, flexShrink: 0 }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} aria-hidden="true" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SkeletonLine width="60%" height="14px" />
        <SkeletonLine width="40%" height="12px" />
      </div>
      <SkeletonLine width="60px" height="18px" radius="6px" />
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SkeletonLine width="50%" height="28px" radius="8px" />
      <SkeletonLine width="100%" height="120px" radius="16px" />
      <SkeletonList count={5} />
    </div>
  );
}
