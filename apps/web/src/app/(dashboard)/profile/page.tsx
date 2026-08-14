'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Bell, LogOut, ChevronRight, Wallet } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { DangerButton } from '@/components/ui/Buttons';
import { BackgroundRefreshError, PageError, PageLoading, queryErrorPresentation } from '@/components/ui/AsyncState';
import { api, messageForError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatMoney } from '@/lib/utils';
import { bestEffortDisableCurrentPush } from '@/features/push/cleanup';

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile.get });
  const logout = useMutation({
    mutationFn: async () => {
      await bestEffortDisableCurrentPush();
      return api.auth.logout();
    },
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });

  const handleSignOut = () => logout.mutate();

  const menuItems = [
    { href: '/profile/edit', icon: Edit2, label: 'Edit Profile' },
    { href: '/notifications', icon: Bell, label: 'Notifications' },
  ];
  const errorPresentation = queryErrorPresentation(profileQuery.error, profileQuery.data !== undefined);

  if (profileQuery.isPending) return <><AppHeader title="Profile" /><PageLoading label="Loading profile" /></>;
  if (errorPresentation === 'blocking') return <><AppHeader title="Profile" /><PageError message={messageForError(profileQuery.error)} retry={() => profileQuery.refetch()} /></>;
  const profile = profileQuery.data!;

  return (
    <>
      <AppHeader title="Profile" />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>

          {errorPresentation === 'background' && (
            <BackgroundRefreshError
              retry={() => void profileQuery.refetch()}
              isRetrying={profileQuery.isFetching}
            />
          )}

          {/* Profile Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-primary-deep), var(--color-primary-medium))',
              borderRadius: '24px', padding: '24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              boxShadow: '0 8px 32px rgba(79,70,229,0.3)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <Avatar name={profile.fullName} imageUrl={profile.avatarUrl} size="xl" />
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginBottom: '4px' }}>{profile.fullName}</h1>
              <p style={{ fontSize: '13px', color: 'white' }}>{profile.email}</p>
              {profile.upiId && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
                  <Wallet size={14} color="white" />
                  <span style={{ fontSize: '13px', color: 'white', fontWeight: 500 }}>{profile.upiId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Financial Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-medium)', fontWeight: 500, marginBottom: '6px' }}>Total Income</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-green)' }}>{formatMoney(profile.totalIncome, true)}</p>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-medium)', fontWeight: 500, marginBottom: '6px' }}>Net Balance</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: parseFloat(profile.totalBalance) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                {Number(profile.totalBalance) < 0 ? '-' : ''}{formatMoney(profile.totalBalance, true)}
              </p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="card" style={{ padding: '0 16px' }}>
            {menuItems.map(({ href, icon: Icon, label }, i) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '16px 0',
                  borderBottom: i < menuItems.length - 1 ? '1px solid var(--color-light)' : 'none',
                  color: 'var(--color-dark)',
                  cursor: 'pointer',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--color-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color="var(--color-primary-deep)" />
                  </div>
                  <span style={{ flex: 1, fontSize: '15px', fontWeight: 500 }}>{label}</span>
                  <ChevronRight size={18} color="var(--color-medium)" />
                </div>
              </Link>
            ))}
          </div>

          {/* Sign Out */}
          {logout.isError && <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>{messageForError(logout.error)}</p>}
          <DangerButton fullWidth loading={logout.isPending} onClick={handleSignOut} icon={<LogOut size={18} />}>
            Sign Out
          </DangerButton>
        </div>
      </PageShell>
    </>
  );
}
