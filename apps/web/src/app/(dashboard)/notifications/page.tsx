'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { MOCK_NOTIFICATIONS } from '@/lib/mockData';
import { formatRelativeTime } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

const TYPE_ICONS: Record<string, string> = {
  expense_added: '💸',
  member_added: '👥',
  settlement_request: '💳',
  settlement_confirmed: '✅',
  settlement_rejected: '❌',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <>
      <AppHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        showBack
        rightAction={
          unreadCount > 0 ? (
            <button className="btn btn-ghost btn-sm" onClick={markAllRead} style={{ gap: '4px', fontSize: '13px', color: 'var(--color-primary-deep)' }}>
              <CheckCheck size={16} /> All read
            </button>
          ) : undefined
        }
      />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: '8px' }}>
          {notifications.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="All caught up!"
              description="Group and payment updates appear here."
            />
          ) : (
            notifications.map((notif, i) => (
              <Link
                key={notif.id}
                href={notif.href}
                style={{ textDecoration: 'none' }}
                onClick={() => markRead(notif.id)}
              >
                <div
                  className={`animate-slideUp stagger-${Math.min(i + 1, 5)}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '14px 16px',
                    background: notif.isRead ? 'transparent' : 'var(--color-primary-lightest)',
                    borderLeft: notif.isRead ? 'none' : '3px solid var(--color-primary-deep)',
                    borderBottom: '1px solid var(--color-light)',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    marginLeft: notif.isRead ? '0' : '-3px',
                  }}
                >
                  {/* Icon */}
                  <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'var(--color-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                    {TYPE_ICONS[notif.type] ?? '🔔'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <p style={{ fontSize: '14px', fontWeight: notif.isRead ? 500 : 700, color: 'var(--color-black)', lineHeight: 1.3 }}>{notif.title}</p>
                      {!notif.isRead && <div className="notif-dot" style={{ marginTop: '4px' }} />}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--color-medium)', lineHeight: 1.5, marginTop: '3px' }}>{notif.message}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-medium)', marginTop: '5px' }}>{formatRelativeTime(notif.createdAt)}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </PageShell>
    </>
  );
}
