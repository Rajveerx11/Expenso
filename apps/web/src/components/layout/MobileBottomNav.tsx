'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Home, Receipt, Users, User } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/expenses', icon: Receipt, label: 'Expenses' },
  { href: '/groups', icon: Users, label: 'Groups' },
  { href: '/notifications', icon: Bell, label: 'Inbox' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function MobileBottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav lg:hidden" aria-label="Main navigation">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              textDecoration: 'none',
              padding: '4px 8px',
              borderRadius: '12px',
              transition: 'all 0.1s ease',
              color: isActive ? 'var(--color-primary-deep)' : 'var(--color-medium)',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <div style={{
              width: 36,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '10px',
              background: isActive ? 'var(--color-primary-lightest)' : 'transparent',
              transition: 'all 0.15s ease',
              position: 'relative',
            }}>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              {label === 'Inbox' && unreadCount > 0 && (
                <span aria-label={`${unreadCount} unread notifications`} style={{ position: 'absolute', top: -4, right: -5, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--color-red)', color: 'white', fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: '10px', fontWeight: isActive ? 600 : 400, letterSpacing: '0.3px' }}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
