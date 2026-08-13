import { ReactNode } from 'react';
import { Wallet } from 'lucide-react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-bg" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Brand header */}
      <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 38, height: 38, borderRadius: '11px',
          background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
        }}>
          <Wallet size={18} color="white" />
        </div>
        <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-black)', letterSpacing: '-0.5px' }}>Expenso</span>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px 48px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
