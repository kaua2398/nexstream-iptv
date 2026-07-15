'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaCardDto } from '@nexstream/shared';
import { CatalogPage } from '@/components/media/catalog-page';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';

interface HistoryRow {
  mediaId: string;
  mediaType: MediaCardDto['type'];
  title: string;
  imageUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
}

export default function HistoryPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['history'], queryFn: () => api.get<{ items: HistoryRow[] }>('/library/history') });
  const clear = useMutation({
    mutationFn: () => api.delete('/library/history'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['history'] }),
  });
  const items: MediaCardDto[] = (query.data?.items ?? []).map((item) => ({
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
    <div className="space-y-6">
      <div className="flex justify-end"><Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>Limpar histórico</Button></div>
      <CatalogPage title="Histórico" items={items} />
    </div>
  );
}
