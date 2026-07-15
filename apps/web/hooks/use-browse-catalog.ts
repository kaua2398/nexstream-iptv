'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { BrowseCatalogType, CatalogBrowseDto } from '@nexstream/shared';
import { api } from '@/services/api';

interface BrowseCatalogOptions {
  type: BrowseCatalogType;
  categoryId: string | null;
  query: string;
  page: number;
  limit?: number;
}

export function useBrowseCatalog({
  type,
  categoryId,
  query,
  page,
  limit = 36,
}: BrowseCatalogOptions) {
  const params = new URLSearchParams({
    type,
    page: String(page),
    limit: String(limit),
  });

  if (categoryId) params.set('categoryId', categoryId);
  if (query.trim()) params.set('query', query.trim());

  return useQuery({
    queryKey: ['catalog', 'browse', type, categoryId, query, page, limit],
    queryFn: () => api.get<CatalogBrowseDto>(`/catalog/browse?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
}