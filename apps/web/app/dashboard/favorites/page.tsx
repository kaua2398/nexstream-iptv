'use client';

import { useQuery } from '@tanstack/react-query';
import type { MediaCardDto } from '@nexstream/shared';
import { StaticCatalogPage } from '@/components/media/static-catalog-page';
import { api } from '@/services/api';

interface FavoriteRow {
  mediaId: string;
  mediaType: MediaCardDto['type'];
  title: string;
  imageUrl: string | null;
}

export default function FavoritesPage() {
  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get<{ items: FavoriteRow[] }>('/library/favorites'),
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
  }));
  return <StaticCatalogPage title="Favoritos" items={items} />;
}
