import { ReactNode } from 'react';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { requirePageUser } from '@/server/auth/session';
import { getProfile } from '@/server/profile/profile-service';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { client, userId } = await requirePageUser();
  const profile = await getProfile(client, userId);
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
