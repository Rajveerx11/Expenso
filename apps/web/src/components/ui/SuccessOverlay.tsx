'use client';
import { useEffect, useState } from 'react';

interface SuccessOverlayProps {
  show: boolean;
  message?: string;
  onComplete?: () => void;
}

export function SuccessOverlay({ show, message = 'Done!', onComplete }: SuccessOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
      }}
      className="animate-fadeIn"
    >
      <div className="animate-bounceIn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-green), #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-black)' }}>{message}</p>
      </div>
    </div>
  );
}
