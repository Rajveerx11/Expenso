'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  backHref?: string;
  rightAction?: ReactNode;
  subtitle?: string;
  transparent?: boolean;
}

export function AppHeader({ title, showBack = false, backHref, rightAction, subtitle, transparent = false }: AppHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) router.push(backHref);
    else router.back();
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: transparent ? 'transparent' : 'rgba(250,250,250,0.9)',
      backdropFilter: transparent ? 'none' : 'blur(16px)',
      WebkitBackdropFilter: transparent ? 'none' : 'blur(16px)',
      borderBottom: transparent ? 'none' : '1px solid rgba(0,0,0,0.05)',
      padding: 'env(safe-area-inset-top, 0px) 16px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '56px', padding: '8px 0' }}>
        {showBack && (
          <button
            onClick={handleBack}
            className="btn btn-ghost btn-icon"
            style={{ marginLeft: '-8px', flexShrink: 0 }}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <h1 style={{
            fontSize: '18px', fontWeight: 700, color: 'var(--color-black)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '12px', color: 'var(--color-medium)' }}>{subtitle}</p>}
        </div>
        {rightAction && <div style={{ flexShrink: 0 }}>{rightAction}</div>}
      </div>
    </header>
  );
}
