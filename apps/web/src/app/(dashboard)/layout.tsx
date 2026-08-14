import { ReactNode } from 'react';
import { DashboardFrame } from '@/components/layout/DashboardFrame';
import { requirePageUser } from '@/server/auth/session';
import { getProfile } from '@/server/profile/profile-service';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { client, userId } = await requirePageUser();
  const profile = await getProfile(client, userId);
  return <DashboardFrame initialProfile={profile}>{children}</DashboardFrame>;
}
