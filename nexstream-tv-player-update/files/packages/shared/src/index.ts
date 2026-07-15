import { z } from 'zod';

export const mediaTypeSchema = z.enum(['live', 'movie', 'episode']);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const loginRequestSchema = z
  .object({
    serverUrl: z.string().url().max(2048),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(512),
    remember: z.boolean(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface MediaCardDto {
  id: string;
  type: MediaType | 'series';
  title: string;
  imageUrl: string | null;
  backdropUrl: string | null;
  categoryId: string | null;
  year: string | null;
  rating: number | null;
  progress?: number;
}

export interface CategoryDto {
  id: string;
  name: string;
  type: 'live' | 'movie' | 'series';
}

export interface HomeCatalogDto {
  live: MediaCardDto[];
  movies: MediaCardDto[];
  series: MediaCardDto[];
  categories: CategoryDto[];
}

export type BrowseCatalogType = 'live' | 'movie' | 'series';
export type CatalogCategoryKind = 'platform' | 'genre' | 'other';

export interface CatalogCategoryDto {
  id: string;
  name: string;
  kind: CatalogCategoryKind;
  type: BrowseCatalogType;
  count: number;
}

export interface CatalogBrowseDto {
  type: BrowseCatalogType;
  categories: CatalogCategoryDto[];
  recentItems: MediaCardDto[];
  items: MediaCardDto[];
  page: number;
  pageSize: number;
  total: number;
  allTotal: number;
  totalPages: number;
  selectedCategoryId: string | null;
  query: string;
}

export interface SeriesEpisodeDto {
  id: string;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  imageUrl: string | null;
  plot: string | null;
  durationSeconds: number | null;
  rating: number | null;
  releaseDate: string | null;
}

export interface SeriesSeasonDto {
  seasonNumber: number;
  name: string;
  coverUrl: string | null;
  episodes: SeriesEpisodeDto[];
}

export interface SeriesDetailsDto {
  id: string;
  title: string;
  plot: string | null;
  coverUrl: string | null;
  backdropUrl: string | null;
  year: string | null;
  rating: number | null;
  genre: string | null;
  cast: string | null;
  director: string | null;
  durationMinutes: number | null;
  seasons: SeriesSeasonDto[];
}
