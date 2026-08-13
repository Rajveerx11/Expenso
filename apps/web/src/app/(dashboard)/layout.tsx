import { ReactNode } from 'react';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MOCK_PROFILE } from '@/lib/mockData';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const profile = MOCK_PROFILE;
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--color-snow)' }}>
      {/* Desktop Sidebar */}
      <DesktopSidebar
        userName={profile.fullName}
        userEmail={profile.email}
        userAvatar={profile.avatarUrl}
        unreadCount={2}
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
}
