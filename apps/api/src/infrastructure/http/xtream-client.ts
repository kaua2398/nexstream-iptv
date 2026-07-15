import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { CategoryDto, HomeCatalogDto, MediaCardDto } from '@nexstream/shared';
import { buildProviderUrl, validatePublicHttpUrl } from '../../security/ssrf.js';
import { AppError } from '../../utils/errors.js';
import type { OpaqueIdService } from '../../security/opaque-id.js';
import type { MemoryCache } from '../cache/memory-cache.js';

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

const authResponseSchema = z.object({
  user_info: z.object({
    auth: z.union([z.number(), z.string()]),
    username: z.string().optional(),
    status: z.string().optional(),
    exp_date: z.string().nullable().optional(),
    max_connections: z.union([z.string(), z.number()]).optional(),
  }),
  server_info: z.record(z.unknown()).optional(),
});

const categorySchema = z
  .object({
    category_id: z.union([z.string(), z.number()]),
    category_name: z.string().catch('Sem categoria'),
  })
  .passthrough();

const liveSchema = z
  .object({
    stream_id: z.union([z.string(), z.number()]),
    name: z.string().catch('Canal sem nome'),
    stream_icon: z.string().nullable().optional(),
    category_id: z.union([z.string(), z.number()]).nullable().optional(),
    epg_channel_id: z.string().nullable().optional(),
  })
  .passthrough();

const movieSchema = z
  .object({
    stream_id: z.union([z.string(), z.number()]),
    name: z.string().catch('Filme sem nome'),
    stream_icon: z.string().nullable().optional(),
    category_id: z.union([z.string(), z.number()]).nullable().optional(),
    rating: z.union([z.string(), z.number()]).nullable().optional(),
    rating_5based: z.union([z.string(), z.number()]).nullable().optional(),
    added: z.string().nullable().optional(),
    container_extension: z.string().nullable().optional(),
  })
  .passthrough();

const seriesSchema = z
  .object({
    series_id: z.union([z.string(), z.number()]),
    name: z.string().catch('Série sem nome'),
    cover: z.string().nullable().optional(),
    backdrop_path: z.union([z.array(z.string()), z.string()]).nullable().optional(),
    category_id: z.union([z.string(), z.number()]).nullable().optional(),
    rating: z.union([z.string(), z.number()]).nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    release_date: z.string().nullable().optional(),
  })
  .passthrough();

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export class XtreamClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly opaqueIds: OpaqueIdService,
    private readonly cache: MemoryCache,
  ) {
    this.http = axios.create({
      timeout: 10_000,
      maxRedirects: 0,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: { 'User-Agent': 'NexStream/0.1' },
    });
  }

  private async base(credentials: XtreamCredentials): Promise<URL> {
    const validated = await validatePublicHttpUrl(credentials.serverUrl);
    return validated.url;
  }

  private async playerApi<T>(credentials: XtreamCredentials, action?: string): Promise<T> {
    const base = await this.base(credentials);
    const url = buildProviderUrl(base, 'player_api.php');
    const response = await this.http.get<T>(url.toString(), {
      params: {
        username: credentials.username,
        password: credentials.password,
        ...(action ? { action } : {}),
      },
    });
    return response.data;
  }

  async authenticate(credentials: XtreamCredentials): Promise<{ providerUsername: string }> {
    try {
      const parsed = authResponseSchema.parse(await this.playerApi(credentials));
      const authenticated = String(parsed.user_info.auth) === '1';
      if (!authenticated || parsed.user_info.status === 'Banned') {
        throw new AppError(401, 'INVALID_PROVIDER_CREDENTIALS', 'Não foi possível autenticar.');
      }
      return { providerUsername: parsed.user_info.username ?? credentials.username };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, 'INVALID_PROVIDER_CREDENTIALS', 'Não foi possível autenticar.');
    }
  }

  async homeCatalog(userId: string, credentials: XtreamCredentials): Promise<HomeCatalogDto> {
    const cacheKey = `home:${userId}`;
    const cached = this.cache.get<HomeCatalogDto>(cacheKey);
    if (cached) return cached;

    const [liveCategoriesRaw, movieCategoriesRaw, seriesCategoriesRaw, liveRaw, moviesRaw, seriesRaw] =
      await Promise.all([
        this.playerApi<unknown>(credentials, 'get_live_categories'),
        this.playerApi<unknown>(credentials, 'get_vod_categories'),
        this.playerApi<unknown>(credentials, 'get_series_categories'),
        this.playerApi<unknown>(credentials, 'get_live_streams'),
        this.playerApi<unknown>(credentials, 'get_vod_streams'),
        this.playerApi<unknown>(credentials, 'get_series'),
      ]);

    const mapCategories = (raw: unknown, type: CategoryDto['type']): CategoryDto[] =>
      z
        .array(categorySchema)
        .catch([])
        .parse(raw)
        .map((item) => ({
          id: this.opaqueIds.create({
            userId,
            type: 'category',
            providerId: String(item.category_id),
          }),
          name: item.category_name,
          type,
        }));

    const live: MediaCardDto[] = z
      .array(liveSchema)
      .catch([])
      .parse(liveRaw)
      .slice(0, 120)
      .map((item) => ({
        id: this.opaqueIds.create({ userId, type: 'live', providerId: String(item.stream_id) }),
        type: 'live',
        title: item.name,
        imageUrl: safeImageUrl(item.stream_icon),
        backdropUrl: null,
        categoryId:
          item.category_id == null
            ? null
            : this.opaqueIds.create({
                userId,
                type: 'category',
                providerId: String(item.category_id),
              }),
        year: null,
        rating: null,
      }));

    const movies: MediaCardDto[] = z
      .array(movieSchema)
      .catch([])
      .parse(moviesRaw)
      .slice(0, 120)
      .map((item) => ({
        id: this.opaqueIds.create({
          userId,
          type: 'movie',
          providerId: String(item.stream_id),
          extension: item.container_extension ?? 'mp4',
        }),
        type: 'movie',
        title: item.name,
        imageUrl: safeImageUrl(item.stream_icon),
        backdropUrl: null,
        categoryId:
          item.category_id == null
            ? null
            : this.opaqueIds.create({
                userId,
                type: 'category',
                providerId: String(item.category_id),
              }),
        year: item.added?.slice(0, 4) ?? null,
        rating: numberOrNull(item.rating ?? item.rating_5based),
      }));

    const series: MediaCardDto[] = z
      .array(seriesSchema)
      .catch([])
      .parse(seriesRaw)
      .slice(0, 120)
      .map((item) => {
        const backdrop = Array.isArray(item.backdrop_path)
          ? item.backdrop_path[0]
          : item.backdrop_path;
        return {
          id: this.opaqueIds.create({
            userId,
            type: 'series',
            providerId: String(item.series_id),
          }),
          type: 'series',
          title: item.name,
          imageUrl: safeImageUrl(item.cover),
          backdropUrl: safeImageUrl(backdrop),
          categoryId:
          item.category_id == null
            ? null
            : this.opaqueIds.create({
                userId,
                type: 'category',
                providerId: String(item.category_id),
              }),
          year: (item.releaseDate ?? item.release_date)?.slice(0, 4) ?? null,
          rating: numberOrNull(item.rating),
        };
      });

    const result: HomeCatalogDto = {
      live,
      movies,
      series,
      categories: [
        ...mapCategories(liveCategoriesRaw, 'live'),
        ...mapCategories(movieCategoriesRaw, 'movie'),
        ...mapCategories(seriesCategoriesRaw, 'series'),
      ],
    };

    this.cache.set(cacheKey, result, 60_000);
    return result;
  }

  async streamUrl(credentials: XtreamCredentials, payload: {
    type: 'live' | 'movie' | 'episode';
    providerId: string;
    extension?: string;
  }): Promise<URL> {
    const base = await this.base(credentials);
    const extension = (payload.extension ?? (payload.type === 'live' ? 'm3u8' : 'mp4'))
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 10);
    const folder = payload.type === 'episode' ? 'series' : payload.type;
    return buildProviderUrl(
      base,
      `${folder}/${encodeURIComponent(credentials.username)}/${encodeURIComponent(credentials.password)}/${encodeURIComponent(payload.providerId)}.${extension}`,
    );
  }
}
