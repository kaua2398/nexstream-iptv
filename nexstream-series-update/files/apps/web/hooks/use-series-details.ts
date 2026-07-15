'use client';

import { useQuery } from '@tanstack/react-query';
import type { SeriesDetailsDto } from '@nexstream/shared';
import { api } from '@/services/api';

export function useSeriesDetails(seriesId: string) {
  return useQuery({
    queryKey: ['catalog', 'series-details', seriesId],
    queryFn: () => api.get<SeriesDetailsDto>(`/catalog/series/${encodeURIComponent(seriesId)}`),
    enabled: seriesId.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
