'use client';

import { PageError } from '@/components/ui/AsyncState';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError message="This page could not load. Try again." retry={reset} />;
}
