import { z } from 'zod';

export const mediaTypeSchema = z.enum(['live', 'movie', 'episode']);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const loginRequestSchema = z
  .object({
    serverUrl: z.string().url().max(2048),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(512),
    remember: z.boolean().default(false),
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
