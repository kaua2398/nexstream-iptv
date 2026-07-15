import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type {
  BrowseCatalogType,
  CatalogBrowseDto,
  CatalogCategoryDto,
  CategoryDto,
  HomeCatalogDto,
  MediaCardDto,
  SeriesDetailsDto,
  SeriesEpisodeDto,
  SeriesSeasonDto,
} from '@nexstream/shared';
import { buildProviderUrl, validatePublicHttpUrl } from '../../security/ssrf.js';
import { AppError } from '../../utils/errors.js';
import type { OpaqueIdService } from '../../security/opaque-id.js';
import type { MemoryCache } from '../cache/memory-cache.js';

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

interface BrowseInput {
  type: BrowseCatalogType;
  categoryId?: string;
  page: number;
  pageSize: number;
  query: string;
}

interface BrowseIndexedItem {
  card: MediaCardDto;
  providerCategoryId: string | null;
  addedAt: number;
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
    added: z.union([z.string(), z.number()]).nullable().optional(),
    container_extension: z.string().nullable().optional(),
    plot: z.string().nullable().optional(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    release_date: z.string().nullable().optional(),
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
    last_modified: z.union([z.string(), z.number()]).nullable().optional(),
    added: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough();

const episodeSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    episode_num: z.union([z.string(), z.number()]).nullable().optional(),
    season: z.union([z.string(), z.number()]).nullable().optional(),
    title: z.string().nullable().optional(),
    container_extension: z.string().nullable().optional(),
    info: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberFromUnknown(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationToSeconds(value: unknown): number | null {
  const direct = numberFromUnknown(value);
  if (direct != null && direct >= 0) return Math.round(direct);
  if (typeof value !== 'string') return null;
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

const platformRules: Array<[RegExp, string]> = [
  [/netflix/i, 'Netflix'],
  [/(amazon\s*)?prime|prime\s*video/i, 'Prime Video'],
  [/\bhbo\b|\bmax\b/i, 'Max'],
  [/disney|star\+/i, 'Disney+'],
  [/apple\s*tv/i, 'Apple TV+'],
  [/paramount/i, 'Paramount+'],
  [/globoplay|globo\s*play/i, 'Globoplay'],
];

const genreRules: Array<[RegExp, string]> = [
  [/terror|horror/i, 'Terror'],
  [/a[cç][aã]o|action/i, 'Ação'],
  [/com[eé]dia|comedy/i, 'Comédia'],
  [/drama/i, 'Drama'],
  [/romance/i, 'Romance'],
  [/fic[cç][aã]o|sci[-\s]?fi/i, 'Ficção científica'],
  [/anima[cç][aã]o|animation|anime/i, 'Animação'],
  [/document[aá]rio|documentary/i, 'Documentários'],
  [/aventura|adventure/i, 'Aventura'],
  [/suspense|thriller/i, 'Suspense'],
  [/infantil|kids|crian[cç]as/i, 'Infantil'],
  [/nacional|brasil/i, 'Nacionais'],
  [/lan[cç]amento|novidade|recent/i, 'Lançamentos'],
];

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

function classifyCategory(name: string): {
  kind: CatalogCategoryDto['kind'];
  displayName: string;
} {
  for (const [pattern, displayName] of platformRules) {
    if (pattern.test(name)) return { kind: 'platform', displayName };
  }

  for (const [pattern, displayName] of genreRules) {
    if (pattern.test(name)) return { kind: 'genre', displayName };
  }

  return { kind: 'other', displayName: name.trim() || 'Outros' };
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
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

  private async playerApi<T>(
    credentials: XtreamCredentials,
    action?: string,
    extraParams: Record<string, string> = {},
  ): Promise<T> {
    const base = await this.base(credentials);
    const url = buildProviderUrl(base, 'player_api.php');

    const isLargeCatalog =
      action === 'get_live_streams' ||
      action === 'get_vod_streams' ||
      action === 'get_series';

    const responseLimit = isLargeCatalog ? 64 * 1024 * 1024 : 10 * 1024 * 1024;

    const response = await this.http.get<T>(url.toString(), {
      params: {
        username: credentials.username,
        password: credentials.password,
        ...(action ? { action } : {}),
        ...extraParams,
      },
      timeout: isLargeCatalog ? 30_000 : 10_000,
      maxContentLength: responseLimit,
      maxBodyLength: responseLimit,
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

  private liveCard(userId: string, item: z.infer<typeof liveSchema>): MediaCardDto {
    return {
      id: this.opaqueIds.create({
        userId,
        type: 'live',
        providerId: String(item.stream_id),
      }),
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
              providerId: JSON.stringify([String(item.category_id)]),
            }),
      year: null,
      rating: null,
    };
  }

  private movieCard(userId: string, item: z.infer<typeof movieSchema>): MediaCardDto {
    return {
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
              providerId: JSON.stringify([String(item.category_id)]),
            }),
      year:
        item.year != null
          ? String(item.year).slice(0, 4)
          : (item.releaseDate ?? item.release_date)?.slice(0, 4) ?? null,
      rating: numberOrNull(item.rating ?? item.rating_5based),
    };
  }

  private seriesCard(userId: string, item: z.infer<typeof seriesSchema>): MediaCardDto {
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
              providerId: JSON.stringify([String(item.category_id)]),
            }),
      year: (item.releaseDate ?? item.release_date)?.slice(0, 4) ?? null,
      rating: numberOrNull(item.rating),
    };
  }

  private async browseCategories(
    userId: string,
    credentials: XtreamCredentials,
    type: BrowseCatalogType,
    counts: ReadonlyMap<string, number>,
  ): Promise<CatalogCategoryDto[]> {
    const cacheKey = `browse-categories-raw:${userId}:${type}`;
    let raw = this.cache.get<Array<z.infer<typeof categorySchema>>>(cacheKey);

    if (!raw) {
      const action =
        type === 'live'
          ? 'get_live_categories'
          : type === 'movie'
            ? 'get_vod_categories'
            : 'get_series_categories';
      raw = z.array(categorySchema).catch([]).parse(
        await this.playerApi<unknown>(credentials, action),
      );
      this.cache.set(cacheKey, raw, 5 * 60_000);
    }

    const kindOrder: Record<CatalogCategoryDto['kind'], number> = {
      platform: 0,
      genre: 1,
      other: 2,
    };

    const categoryRows = raw ?? [];

    return categoryRows
      .map((item) => {
        const providerId = String(item.category_id);
        const classification = classifyCategory(item.category_name);

        return {
          id: this.opaqueIds.create({
            userId,
            type: 'category',
            providerId: JSON.stringify([providerId]),
          }),
          name: item.category_name.trim() || classification.displayName,
          kind: classification.kind,
          type,
          count: counts.get(providerId) ?? 0,
        } satisfies CatalogCategoryDto;
      })
      .sort((a, b) => {
        const byKind = kindOrder[a.kind] - kindOrder[b.kind];
        return byKind || a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  private parseCategoryProviderIds(categoryId: string | undefined, userId: string): string[] {
    if (!categoryId) return [];

    const payload = this.opaqueIds.parse(categoryId, userId);
    if (payload.type !== 'category') {
      throw new AppError(400, 'INVALID_CATEGORY', 'Categoria inválida.');
    }

    try {
      const parsed = JSON.parse(payload.providerId) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Invalid category payload');

      const ids = parsed
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 64);

      if (!ids.length || ids.length > 50) throw new Error('Invalid category count');
      return [...new Set(ids)];
    } catch {
      throw new AppError(400, 'INVALID_CATEGORY', 'Categoria inválida.');
    }
  }

  private async browseItems(
    userId: string,
    credentials: XtreamCredentials,
    type: BrowseCatalogType,
  ): Promise<BrowseIndexedItem[]> {
    const cacheKey = `browse-items-indexed:${userId}:${type}`;
    const cached = this.cache.get<BrowseIndexedItem[]>(cacheKey);
    if (cached) return cached;

    const action =
      type === 'live'
        ? 'get_live_streams'
        : type === 'movie'
          ? 'get_vod_streams'
          : 'get_series';

    const response = await this.playerApi<unknown>(credentials, action);
    const items: BrowseIndexedItem[] = [];

    if (type === 'live') {
      for (const item of z.array(liveSchema).catch([]).parse(response)) {
        items.push({
          card: this.liveCard(userId, item),
          providerCategoryId:
            item.category_id == null ? null : String(item.category_id),
          addedAt: 0,
        });
      }
    } else if (type === 'movie') {
      for (const item of z.array(movieSchema).catch([]).parse(response)) {
        items.push({
          card: this.movieCard(userId, item),
          providerCategoryId:
            item.category_id == null ? null : String(item.category_id),
          addedAt: numberFromUnknown(item.added) ?? 0,
        });
      }
    } else {
      for (const item of z.array(seriesSchema).catch([]).parse(response)) {
        items.push({
          card: this.seriesCard(userId, item),
          providerCategoryId:
            item.category_id == null ? null : String(item.category_id),
          addedAt:
            numberFromUnknown(item.last_modified ?? item.added) ?? 0,
        });
      }
    }

    items.sort((a, b) => b.addedAt - a.addedAt);
    this.cache.set(cacheKey, items, 5 * 60_000);
    return items;
  }

  async browseCatalog(
    userId: string,
    credentials: XtreamCredentials,
    input: BrowseInput,
  ): Promise<CatalogBrowseDto> {
    const indexed = await this.browseItems(userId, credentials, input.type);
    const counts = new Map<string, number>();

    for (const item of indexed) {
      if (!item.providerCategoryId) continue;
      counts.set(
        item.providerCategoryId,
        (counts.get(item.providerCategoryId) ?? 0) + 1,
      );
    }

    const categories = await this.browseCategories(
      userId,
      credentials,
      input.type,
      counts,
    );
    const selectedProviderIds = new Set(
      this.parseCategoryProviderIds(input.categoryId, userId),
    );
    const normalizedQuery = normalizeSearch(input.query);

    const filtered = indexed.filter((item) => {
      if (
        selectedProviderIds.size > 0 &&
        (!item.providerCategoryId || !selectedProviderIds.has(item.providerCategoryId))
      ) {
        return false;
      }

      return !normalizedQuery || normalizeSearch(item.card.title).includes(normalizedQuery);
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
    const page = Math.min(input.page, totalPages);
    const start = (page - 1) * input.pageSize;

    return {
      type: input.type,
      categories,
      recentItems: input.type === 'live' ? [] : filtered.slice(0, 12).map((item) => item.card),
      items: filtered.slice(start, start + input.pageSize).map((item) => item.card),
      page,
      pageSize: input.pageSize,
      total,
      allTotal: indexed.length,
      totalPages,
      selectedCategoryId: input.categoryId ?? null,
      query: input.query,
    };
  }

  async seriesDetails(
    userId: string,
    credentials: XtreamCredentials,
    seriesId: string,
  ): Promise<SeriesDetailsDto> {
    const payload = this.opaqueIds.parse(seriesId, userId);
    if (payload.type !== 'series') {
      throw new AppError(404, 'SERIES_NOT_FOUND', 'Série não encontrada.');
    }

    const cacheKey = `series-details:${userId}:${payload.providerId}`;
    const cached = this.cache.get<SeriesDetailsDto>(cacheKey);
    if (cached) return cached;

    const raw = recordOrEmpty(
      await this.playerApi<unknown>(credentials, 'get_series_info', {
        series_id: payload.providerId,
      }),
    );
    const info = recordOrEmpty(raw.info);
    const seasonsRaw = Array.isArray(raw.seasons) ? raw.seasons : [];
    const seasonMetadata = new Map<number, Record<string, unknown>>();

    for (const season of seasonsRaw) {
      const record = recordOrEmpty(season);
      const seasonNumber = numberFromUnknown(
        record.season_number ?? record.season ?? record.number,
      );
      if (seasonNumber != null) seasonMetadata.set(seasonNumber, record);
    }

    const episodeGroups = new Map<number, SeriesEpisodeDto[]>();
    const episodesContainer = raw.episodes;
    const entries: Array<[string, unknown]> = Array.isArray(episodesContainer)
      ? [['1', episodesContainer]]
      : Object.entries(recordOrEmpty(episodesContainer));

    for (const [seasonKey, value] of entries) {
      if (!Array.isArray(value)) continue;
      const fallbackSeason = numberFromUnknown(seasonKey) ?? 1;

      for (const episodeRaw of value) {
        const parsed = episodeSchema.safeParse(episodeRaw);
        if (!parsed.success) continue;
        const episode = parsed.data;
        const episodeInfo = recordOrEmpty(episode.info);
        const seasonNumber =
          numberFromUnknown(episode.season) ?? fallbackSeason;
        const episodeNumber =
          numberFromUnknown(episode.episode_num) ??
          (episodeGroups.get(seasonNumber)?.length ?? 0) + 1;
        const extension = episode.container_extension ?? 'mp4';
        const image =
          safeImageUrl(episodeInfo.movie_image) ??
          safeImageUrl(episodeInfo.cover_big) ??
          safeImageUrl(episodeInfo.cover);

        const mapped: SeriesEpisodeDto = {
          id: this.opaqueIds.create({
            userId,
            type: 'episode',
            providerId: String(episode.id),
            extension,
          }),
          title:
            stringOrNull(episode.title) ??
            `Episódio ${episodeNumber}`,
          episodeNumber,
          seasonNumber,
          imageUrl: image,
          plot:
            stringOrNull(episodeInfo.plot) ??
            stringOrNull(episodeInfo.description),
          durationSeconds:
            durationToSeconds(episodeInfo.duration_secs) ??
            durationToSeconds(episodeInfo.duration),
          rating: numberFromUnknown(episodeInfo.rating),
          releaseDate:
            stringOrNull(episodeInfo.releasedate) ??
            stringOrNull(episodeInfo.release_date),
        };

        const group = episodeGroups.get(seasonNumber) ?? [];
        group.push(mapped);
        episodeGroups.set(seasonNumber, group);
      }
    }

    const seasons: SeriesSeasonDto[] = [...episodeGroups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, episodes]) => {
        const metadata = seasonMetadata.get(seasonNumber) ?? {};
        episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

        return {
          seasonNumber,
          name:
            stringOrNull(metadata.name) ??
            `Temporada ${seasonNumber}`,
          coverUrl:
            safeImageUrl(metadata.cover_big) ??
            safeImageUrl(metadata.cover),
          episodes,
        };
      });

    const backdropRaw = info.backdrop_path;
    const backdrop = Array.isArray(backdropRaw)
      ? backdropRaw[0]
      : backdropRaw;
    const release =
      stringOrNull(info.releaseDate) ??
      stringOrNull(info.release_date) ??
      stringOrNull(info.releasedate);

    const result: SeriesDetailsDto = {
      id: seriesId,
      title:
        stringOrNull(info.name) ??
        stringOrNull(info.title) ??
        'Série sem nome',
      plot:
        stringOrNull(info.plot) ??
        stringOrNull(info.description),
      coverUrl:
        safeImageUrl(info.cover) ??
        safeImageUrl(info.cover_big),
      backdropUrl: safeImageUrl(backdrop),
      year: release?.slice(0, 4) ?? null,
      rating: numberFromUnknown(info.rating),
      genre: stringOrNull(info.genre),
      cast: stringOrNull(info.cast),
      director: stringOrNull(info.director),
      durationMinutes: numberFromUnknown(info.episode_run_time),
      seasons,
    };

    this.cache.set(cacheKey, result, 5 * 60_000);
    return result;
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
            providerId: JSON.stringify([String(item.category_id)]),
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
                providerId: JSON.stringify([String(item.category_id)]),
              }),
        year: null,
        rating: null,
      }));

    const movies = z
      .array(movieSchema)
      .catch([])
      .parse(moviesRaw)
      .sort((a, b) => (numberFromUnknown(b.added) ?? 0) - (numberFromUnknown(a.added) ?? 0))
      .slice(0, 120)
      .map((item) => this.movieCard(userId, item));
    const series = z
      .array(seriesSchema)
      .catch([])
      .parse(seriesRaw)
      .sort(
        (a, b) =>
          (numberFromUnknown(b.last_modified ?? b.added) ?? 0) -
          (numberFromUnknown(a.last_modified ?? a.added) ?? 0),
      )
      .slice(0, 120)
      .map((item) => this.seriesCard(userId, item));

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