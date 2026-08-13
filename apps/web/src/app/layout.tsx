import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';
import '../styles/globals.css';
import { Providers } from '@/components/Providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Expenso — Track. Split. Settle.',
    template: '%s | Expenso',
  },
  description: 'Track personal expenses, split group costs, and settle up with friends beautifully.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Expenso',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Expenso',
    title: 'Expenso — Track. Split. Settle.',
    description: 'Track personal expenses, split group costs, and settle up with friends beautifully.',
  },
};

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
