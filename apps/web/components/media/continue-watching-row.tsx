'use client';

import { useQuery } from '@tanstack/react-query';
import type { MediaCardDto } from '@nexstream/shared';
import { MediaRow } from '@/components/media/media-row';
import { api } from '@/services/api';

interface HistoryRow {
  mediaId: string;
  mediaType: MediaCardDto['type'];
  title: string;
  imageUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

export function ContinueWatchingRow() {
  const query = useQuery({
    queryKey: ['history'],
    queryFn: () =>
      api.get<{ items: HistoryRow[] }>(
        '/library/history',
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const items: MediaCardDto[] =
    (query.data?.items ?? [])
      .filter(
        (item) =>
          !item.completed &&
          item.positionSeconds >= 10 &&
          item.durationSeconds > 0 &&
          item.positionSeconds <
            item.durationSeconds - 10,
      )
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
        progress:
          item.positionSeconds /
          item.durationSeconds,
      }));

  if (items.length === 0) {
    return null;
  }

  return (
    <MediaRow
      title="Continuar assistindo"
      items={items}
    />
  );
}