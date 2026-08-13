'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, Users, User, Bell, LogOut, Wallet } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/expenses', icon: Receipt, label: 'Expenses' },
  { href: '/groups', icon: Users, label: 'Groups' },
  { href: '/notifications', icon: Bell, label: 'Notifications' },
  { href: '/profile', icon: User, label: 'Profile' },
];

interface DesktopSidebarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
  unreadCount?: number;
}

export function DesktopSidebar({ userName = 'User', userEmail = '', userAvatar = null, unreadCount = 0 }: DesktopSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:flex"
      style={{
        flexDirection: 'column',
        width: 260,
        minHeight: '100dvh',
        background: 'var(--color-white)',
        borderRight: '1px solid var(--color-light)',
        padding: '24px 16px',
        position: 'sticky',
        top: 0,
        gap: '8px',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', marginBottom: '24px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--color-primary-deep), var(--color-primary-medium))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Wallet size={20} color="white" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-black)' }}>Expenso</div>
          <div style={{ fontSize: '11px', color: 'var(--color-medium)' }}>Track. Split. Settle.</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const badge = label === 'Notifications' && unreadCount > 0 ? unreadCount : 0;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 14px', borderRadius: '12px',
                textDecoration: 'none', color: isActive ? 'var(--color-primary-deep)' : 'var(--color-dark)',
                background: isActive ? 'var(--color-primary-lightest)' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: '15px',
                transition: 'all 0.1s ease', position: 'relative',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
              {badge > 0 && (
                <span style={{
                  marginLeft: 'auto', background: 'var(--color-primary-deep)', color: 'white',
                  borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                  padding: '2px 7px', minWidth: '20px', textAlign: 'center',
                }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <Link href="/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'var(--color-snow)', border: '1px solid var(--color-light)' }}>
        <Avatar name={userName} imageUrl={userAvatar} size="sm" />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
        </div>
      </Link>
    </aside>
  );
}
