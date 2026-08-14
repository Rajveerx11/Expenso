'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, ReactNode } from 'react';
import { ApiClientError, registerPrivateCacheClearer } from '@/lib/api/client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: (failureCount, error) => failureCount < 2 && error instanceof ApiClientError && error.retryable,
          },
          mutations: { retry: false },
        },
      })
  );

  useEffect(() => registerPrivateCacheClearer(() => queryClient.clear()), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
