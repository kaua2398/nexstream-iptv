'use client';

import { useQuery } from '@tanstack/react-query';
import type { HomeCatalogDto } from '@nexstream/shared';
import { api } from '@/services/api';

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog', 'home'],
    queryFn: () => api.get<HomeCatalogDto>('/catalog/home'),
  });
}
