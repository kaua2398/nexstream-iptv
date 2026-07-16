'use client';

import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';
import type {
  BrowseCatalogType,
  CatalogBrowseDto,
} from '@nexstream/shared';
import { api } from '@/services/api';

export interface BrowseCatalogOptions {
  type: BrowseCatalogType;
  categoryId: string | null;
  query: string;
  page: number;
  limit?: number;
}

export function browseCatalogQueryOptions({
  type,
  categoryId,
  query,
  page,
  limit = 36,
}: BrowseCatalogOptions) {
  const normalizedQuery = query.trim();

  const params = new URLSearchParams({
    type,
    page: String(page),
    limit: String(limit),
  });

  if (categoryId) {
    params.set('categoryId', categoryId);
  }

  if (normalizedQuery) {
    params.set('query', normalizedQuery);
  }

  return {
    queryKey: [
      'catalog',
      'browse',
      type,
      categoryId,
      normalizedQuery,
      page,
      limit,
    ] as const,
    queryFn: () =>
      api.get<CatalogBrowseDto>(
        `/catalog/browse?${params.toString()}`,
      ),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
}

export function useBrowseCatalog(
  options: BrowseCatalogOptions,
) {
  return useQuery(
    browseCatalogQueryOptions(options),
  );
}