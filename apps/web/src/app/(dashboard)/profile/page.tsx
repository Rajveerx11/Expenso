'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Edit2, Bell, LogOut, ChevronRight, Wallet } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { MoneyText } from '@/components/ui/MoneyText';
import { DangerButton } from '@/components/ui/Buttons';
import { MOCK_PROFILE } from '@/lib/mockData';
import { formatMoney } from '@/lib/utils';

export default function ProfilePage() {
  const router = useRouter();
  const profile = MOCK_PROFILE;

  function handleSignOut() {
    // TODO: Supabase sign out
    router.push('/login');
  }

  const menuItems = [
    { href: '/profile/edit', icon: Edit2, label: 'Edit Profile' },
    { href: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  return (
    <>
      <AppHeader title="Profile" />
      <PageShell>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px', paddingBottom: '32px' }}>

          {/* Profile Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
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
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>{profile.email}</p>
              {profile.upiId && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
                  <Wallet size={14} color="rgba(255,255,255,0.8)" />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{profile.upiId}</span>
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
                {formatMoney(profile.totalBalance, true)}
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
          <DangerButton fullWidth onClick={handleSignOut} icon={<LogOut size={18} />}>
            Sign Out
          </DangerButton>
        </div>
      </PageShell>
    </>
  );
}
