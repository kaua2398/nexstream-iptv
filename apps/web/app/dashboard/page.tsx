'use client';

import { useQuery } from '@tanstack/react-query';
import type { MediaCardDto } from '@nexstream/shared';
import { Hero } from '@/components/media/hero';
import { MediaRow } from '@/components/media/media-row';
import { useCatalog } from '@/hooks/use-catalog';
import { api } from '@/services/api';

import { ContinueWatchingRow } from '@/components/media/continue-watching-row';
interface HistoryRow {
  mediaId: string;
  mediaType: MediaCardDto['type'];
  title: string;
  imageUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
}

export default function DashboardPage() {
  const catalog = useCatalog();
  const history = useQuery({
    queryKey: ['history', 'home'],
    queryFn: () => api.get<{ items: HistoryRow[] }>('/library/history'),
  });

  if (catalog.isPending) {
    return <div className="space-y-8"><div className="h-[48vh] animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>;
  }
  if (catalog.isError) {
    return <div className="rounded-2xl border bg-card p-8">Não foi possível carregar o catálogo. Verifique o servidor e tente novamente.</div>;
  }

  const data = catalog.data;
  const continueItems: MediaCardDto[] = (history.data?.items ?? [])
    .filter((item) => item.durationSeconds <= 0 || item.positionSeconds / item.durationSeconds < 0.9)
    .slice(0, 20)
    .map((item) => ({
      id: item.mediaId,
      type: item.mediaType,
      title: item.title,
      imageUrl: item.imageUrl,
      backdropUrl: null,
      categoryId: null,
      year: null,
      rating: null,
      progress: item.durationSeconds > 0 ? item.positionSeconds / item.durationSeconds : 0,
    }));

  return (
    <div className="space-y-10">
      <Hero item={data.movies[0] ?? data.live[0]} />
      <ContinueWatchingRow />
      <MediaRow title="Continue assistindo" items={continueItems} />
      <MediaRow title="TV ao vivo" items={data.live.slice(0, 30)} />
      <MediaRow title="Filmes adicionados recentemente" items={data.movies.slice(0, 30)} />
      <MediaRow title="Séries adicionadas recentemente" items={data.series.slice(0, 30)} />
    </div>
  );
}
