'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { CatalogPrefetcher } from '@/components/media/catalog-prefetcher';
import { VideoPlayer } from '@/components/player/video-player';
import { api } from '@/services/api';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/auth/me'), retry: false });
  useEffect(() => {
    if (me.isError) router.replace('/login');
  }, [me.isError, router]);

  if (me.isPending) return <main className="grid min-h-screen place-items-center">Carregando sessão…</main>;
  if (me.isError) return null;
  return (
    <div className="min-h-screen">
      <CatalogPrefetcher />
      <Sidebar />
      <main className="px-4 pb-16 pt-20 lg:ml-72 lg:px-8 lg:pt-8">{children}</main>
      <VideoPlayer />
    </div>
  );
}
