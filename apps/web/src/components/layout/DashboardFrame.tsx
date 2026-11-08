'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { currentMonth } from '@/lib/utils';
import { PushRefreshBridge } from '@/features/push/PushRefreshBridge';
import type { Profile } from '@/lib/types';
import { shouldShowMobileBottomNav } from '@/components/layout/mobile-navigation';

interface DashboardFrameProps {
  children: ReactNode;
  initialProfile: Profile;
}

export function DashboardFrame({ children, initialProfile }: DashboardFrameProps) {
  const pathname = usePathname();
  const month = currentMonth();
  const profileQuery = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get, initialData: initialProfile });
  const dashboardQuery = useQuery({ queryKey: queryKeys.dashboard(month), queryFn: () => api.dashboard(month) });
  const unreadCount = dashboardQuery.data?.unreadNotificationCount ?? 0;
  const profile = profileQuery.data;

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--color-snow)' }}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          const main = document.getElementById('main-content');
          if (!main) return;
          event.preventDefault();
          main.focus();
          main.scrollIntoView({ block: 'start' });
        }}
      >
        Skip to main content
      </a>
      <PushRefreshBridge />
      <DesktopSidebar userName={profile.fullName} userEmail={profile.email} userAvatar={profile.avatarUrl} unreadCount={unreadCount} />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</main>
      {shouldShowMobileBottomNav(pathname) && <MobileBottomNav unreadCount={unreadCount} />}
    </div>
  );
}
