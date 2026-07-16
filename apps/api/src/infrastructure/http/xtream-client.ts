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
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
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
      action === 'get_series' ||
      action === 'get_series_info';

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
  ): Promise<
    Array<{
      providerCategoryId: string | null;
      card: MediaCardDto;
    }>
  > {
    const cacheKey =
      `browse-items:${userId}:${type}:all`;

    const cached =
      this.cache.get<
        Array<{
          providerCategoryId: string | null;
          card: MediaCardDto;
        }>
      >(cacheKey);

    if (cached) {
      return cached;
    }

    const action =
      type === 'live'
        ? 'get_live_streams'
        : type === 'movie'
          ? 'get_vod_streams'
          : 'get_series';

    const response =
      await this.playerApi<unknown>(
        credentials,
        action,
      );

    const deduplicated =
      new Map<
        string,
        {
          providerCategoryId: string | null;
          card: MediaCardDto;
        }
      >();

    if (type === 'live') {
      for (
        const item of z
          .array(liveSchema)
          .catch([])
          .parse(response)
      ) {
        const providerId =
          String(item.stream_id);

        if (deduplicated.has(providerId)) {
          continue;
        }

        const providerCategoryId =
          item.category_id == null
            ? null
            : String(item.category_id);

        deduplicated.set(providerId, {
          providerCategoryId,
          card: {
            id: this.opaqueIds.create({
              userId,
              type: 'live',
              providerId,
            }),
            type: 'live',
            title: item.name,
            imageUrl:
              safeImageUrl(item.stream_icon),
            backdropUrl: null,
            categoryId:
              providerCategoryId == null
                ? null
                : this.opaqueIds.create({
                    userId,
                    type: 'category',
                    providerId:
                      JSON.stringify([
                        providerCategoryId,
                      ]),
                  }),
            year: null,
            rating: null,
          },
        });
      }
    } else if (type === 'movie') {
      for (
        const item of z
          .array(movieSchema)
          .catch([])
          .parse(response)
      ) {
        const providerId =
          String(item.stream_id);

        if (deduplicated.has(providerId)) {
          continue;
        }

        deduplicated.set(providerId, {
          providerCategoryId:
            item.category_id == null
              ? null
              : String(item.category_id),
          card: this.movieCard(
            userId,
            item,
          ),
        });
      }
    } else {
      for (
        const item of z
          .array(seriesSchema)
          .catch([])
          .parse(response)
      ) {
        const providerId =
          String(item.series_id);

        if (deduplicated.has(providerId)) {
          continue;
        }

        deduplicated.set(providerId, {
          providerCategoryId:
            item.category_id == null
              ? null
              : String(item.category_id),
          card: this.seriesCard(
            userId,
            item,
          ),
        });
      }
    }

    const items =
      [...deduplicated.values()];

    this.cache.set(
      cacheKey,
      items,
      type === 'live'
        ? 5 * 60_000
        : 15 * 60_000,
    );

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
    const payload = this.opaqueIds.parse(
      seriesId,
      userId,
    );

    if (payload.type !== 'series') {
      throw new AppError(
        404,
        'SERIES_NOT_FOUND',
        'Série não encontrada.',
      );
    }

    const cacheKey =
      `series-details:${userId}:${payload.providerId}`;

    const cached =
      this.cache.get<SeriesDetailsDto>(cacheKey);

    if (cached && cached.seasons.length > 0) {
      return cached;
    }

    const response =
      await this.playerApi<unknown>(
        credentials,
        'get_series_info',
        {
          series_id: payload.providerId,
        },
      );

    const responseRecord =
      recordOrEmpty(response);

    const dataRecord =
      recordOrEmpty(responseRecord.data);

    const resultRecord =
      recordOrEmpty(responseRecord.result);

    const raw: Record<string, unknown> = {
      ...responseRecord,
      ...resultRecord,
      ...dataRecord,
    };

    const infoCandidate =
      recordOrEmpty(
        raw.info ??
          raw.series_info ??
          raw.seriesInfo,
      );

    const info =
      Object.keys(infoCandidate).length > 0
        ? infoCandidate
        : raw;

    const parseUnknownArray = (
      value: unknown,
    ): unknown[] => {
      if (Array.isArray(value)) {
        return value;
      }

      if (typeof value === 'string') {
        try {
          const parsed: unknown =
            JSON.parse(value);

          return Array.isArray(parsed)
            ? parsed
            : [];
        } catch {
          return [];
        }
      }

      return [];
    };

    const firstImage = (
      value: unknown,
    ): string | null => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const image = safeImageUrl(item);

          if (image) {
            return image;
          }
        }

        return null;
      }

      const direct = safeImageUrl(value);

      if (direct) {
        return direct;
      }

      if (typeof value === 'string') {
        try {
          const parsed: unknown =
            JSON.parse(value);

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const image = safeImageUrl(item);

              if (image) {
                return image;
              }
            }
          }
        } catch {
          return null;
        }
      }

      return null;
    };

    const seasonMetadata =
      new Map<number, Record<string, unknown>>();

    const registerSeason = (
      value: unknown,
      fallbackSeason?: number,
    ) => {
      const record = recordOrEmpty(value);

      const seasonNumber =
        numberFromUnknown(
          record.season_number ??
            record.season ??
            record.number,
        ) ??
        fallbackSeason ??
        null;

      if (seasonNumber != null) {
        seasonMetadata.set(
          seasonNumber,
          record,
        );
      }
    };

    const seasonsContainer =
      raw.seasons ??
      raw.season_list ??
      raw.seasonList;

    const seasonsArray =
      parseUnknownArray(seasonsContainer);

    if (seasonsArray.length > 0) {
      for (const season of seasonsArray) {
        registerSeason(season);
      }
    } else {
      for (
        const [seasonKey, seasonValue]
        of Object.entries(
          recordOrEmpty(seasonsContainer),
        )
      ) {
        registerSeason(
          seasonValue,
          numberFromUnknown(seasonKey) ?? undefined,
        );
      }
    }

    interface EpisodeCandidate {
      record: Record<string, unknown>;
      fallbackSeason: number;
    }

    const episodeCandidates: EpisodeCandidate[] = [];

    const pushEpisodeCollection = (
      value: unknown,
      fallbackSeason: number,
      assumeEpisodeItems = false,
    ): void => {
      if (typeof value === 'string') {
        try {
          const parsed: unknown =
            JSON.parse(value);

          pushEpisodeCollection(
            parsed,
            fallbackSeason,
            assumeEpisodeItems,
          );
        } catch {
          return;
        }

        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const record = recordOrEmpty(item);

          const nestedEpisodes =
            record.episodes ??
            record.episode_list ??
            record.episodeList ??
            record.items;

          const nestedSeason =
            numberFromUnknown(
              record.season_number ??
                record.season ??
                record.number,
            ) ??
            fallbackSeason;

          if (nestedEpisodes != null) {
            registerSeason(
              record,
              nestedSeason,
            );

            pushEpisodeCollection(
              nestedEpisodes,
              nestedSeason,
              true,
            );

            continue;
          }

          const providerId =
            record.id ??
            record.episode_id ??
            record.episodeId ??
            record.stream_id ??
            record.streamId;

          const looksLikeEpisode =
            providerId != null &&
            (
              assumeEpisodeItems ||
              record.episode_num != null ||
              record.episode_number != null ||
              record.episodeNumber != null ||
              record.container_extension != null ||
              record.info != null ||
              record.title != null
            );

          if (looksLikeEpisode) {
            episodeCandidates.push({
              record,
              fallbackSeason: nestedSeason,
            });
          }
        }

        return;
      }

      const record = recordOrEmpty(value);

      if (Object.keys(record).length === 0) {
        return;
      }

      const nestedEpisodes =
        record.episodes ??
        record.episode_list ??
        record.episodeList ??
        record.items;

      if (nestedEpisodes != null) {
        const nestedSeason =
          numberFromUnknown(
            record.season_number ??
              record.season ??
              record.number,
          ) ??
          fallbackSeason;

        registerSeason(
          record,
          nestedSeason,
        );

        pushEpisodeCollection(
          nestedEpisodes,
          nestedSeason,
          true,
        );

        return;
      }

      const providerId =
        record.id ??
        record.episode_id ??
        record.episodeId ??
        record.stream_id ??
        record.streamId;

      if (providerId != null && assumeEpisodeItems) {
        episodeCandidates.push({
          record,
          fallbackSeason,
        });

        return;
      }

      for (
        const [key, child]
        of Object.entries(record)
      ) {
        const numericSeason =
          numberFromUnknown(key);

        if (
          numericSeason != null ||
          Array.isArray(child) ||
          typeof child === 'string'
        ) {
          pushEpisodeCollection(
            child,
            numericSeason ?? fallbackSeason,
            true,
          );
        }
      }
    };

    const episodesContainer =
      raw.episodes ??
      raw.episode_list ??
      raw.episodeList ??
      raw.episode ??
      raw.items;

    pushEpisodeCollection(
      episodesContainer,
      1,
      true,
    );

    for (const seasonValue of seasonsArray) {
      const seasonRecord =
        recordOrEmpty(seasonValue);

      const nestedEpisodes =
        seasonRecord.episodes ??
        seasonRecord.episode_list ??
        seasonRecord.episodeList ??
        seasonRecord.items;

      if (nestedEpisodes == null) {
        continue;
      }

      const seasonNumber =
        numberFromUnknown(
          seasonRecord.season_number ??
            seasonRecord.season ??
            seasonRecord.number,
        ) ??
        1;

      pushEpisodeCollection(
        nestedEpisodes,
        seasonNumber,
        true,
      );
    }

    for (
      const [key, value]
      of Object.entries(raw)
    ) {
      if (!/^\d+$/.test(key)) {
        continue;
      }

      pushEpisodeCollection(
        value,
        Number(key),
        true,
      );
    }

    const episodeGroups =
      new Map<number, SeriesEpisodeDto[]>();

    const seenEpisodeIds =
      new Set<string>();

    for (const candidate of episodeCandidates) {
      const episode = candidate.record;

      const providerIdValue =
        episode.id ??
        episode.episode_id ??
        episode.episodeId ??
        episode.stream_id ??
        episode.streamId;

      if (providerIdValue == null) {
        continue;
      }

      const providerId =
        String(providerIdValue).trim();

      if (
        !providerId ||
        seenEpisodeIds.has(providerId)
      ) {
        continue;
      }

      seenEpisodeIds.add(providerId);

      const episodeInfo =
        recordOrEmpty(
          episode.info ??
            episode.episode_info ??
            episode.episodeInfo ??
            episode.metadata,
        );

      const seasonNumber =
        numberFromUnknown(
          episode.season ??
            episode.season_number ??
            episode.seasonNumber ??
            episodeInfo.season ??
            episodeInfo.season_number,
        ) ??
        candidate.fallbackSeason;

      const currentGroup =
        episodeGroups.get(seasonNumber) ?? [];

      const episodeNumber =
        numberFromUnknown(
          episode.episode_num ??
            episode.episode_number ??
            episode.episodeNumber ??
            episode.num ??
            episode.number ??
            episodeInfo.episode_num ??
            episodeInfo.episode_number,
        ) ??
        currentGroup.length + 1;

      const extension =
        stringOrNull(
          episode.container_extension ??
            episode.extension ??
            episode.ext,
        ) ??
        'mp4';

      const image =
        firstImage(
          episodeInfo.movie_image ??
            episodeInfo.cover_big ??
            episodeInfo.cover ??
            episodeInfo.image ??
            episode.movie_image ??
            episode.cover_big ??
            episode.cover ??
            episode.image,
        );

      const mapped: SeriesEpisodeDto = {
        id: this.opaqueIds.create({
          userId,
          type: 'episode',
          providerId,
          extension,
        }),
        title:
          stringOrNull(
            episode.title ??
              episode.name ??
              episodeInfo.title ??
              episodeInfo.name,
          ) ??
          `Episódio ${episodeNumber}`,
        episodeNumber,
        seasonNumber,
        imageUrl: image,
        plot:
          stringOrNull(
            episodeInfo.plot ??
              episodeInfo.description ??
              episode.plot ??
              episode.description,
          ),
        durationSeconds:
          durationToSeconds(
            episodeInfo.duration_secs ??
              episodeInfo.duration_seconds ??
              episodeInfo.duration ??
              episode.duration_secs ??
              episode.duration,
          ),
        rating:
          numberFromUnknown(
            episodeInfo.rating ??
              episodeInfo.rating_5based ??
              episode.rating,
          ),
        releaseDate:
          stringOrNull(
            episodeInfo.releasedate ??
              episodeInfo.release_date ??
              episodeInfo.air_date ??
              episode.releasedate ??
              episode.release_date ??
              episode.air_date,
          ),
      };

      currentGroup.push(mapped);
      episodeGroups.set(
        seasonNumber,
        currentGroup,
      );
    }

    const allSeasonNumbers =
      new Set<number>([
        ...seasonMetadata.keys(),
        ...episodeGroups.keys(),
      ]);

    const seasons: SeriesSeasonDto[] =
      [...allSeasonNumbers]
        .sort((a, b) => a - b)
        .map((seasonNumber) => {
          const metadata =
            seasonMetadata.get(seasonNumber) ?? {};

          const episodes =
            episodeGroups.get(seasonNumber) ?? [];

          episodes.sort(
            (a, b) =>
              a.episodeNumber -
              b.episodeNumber,
          );

          return {
            seasonNumber,
            name:
              stringOrNull(
                metadata.name ??
                  metadata.title,
              ) ??
              `Temporada ${seasonNumber}`,
            coverUrl:
              firstImage(
                metadata.cover_big ??
                  metadata.cover ??
                  metadata.image,
              ),
            episodes,
          };
        })
        .filter(
          (season) =>
            season.episodes.length > 0,
        );

    const release =
      stringOrNull(
        info.releaseDate ??
          info.release_date ??
          info.releasedate ??
          info.air_date,
      );

    const result: SeriesDetailsDto = {
      id: seriesId,
      title:
        stringOrNull(
          info.name ??
            info.title ??
            raw.name ??
            raw.title,
        ) ??
        'Série sem nome',
      plot:
        stringOrNull(
          info.plot ??
            info.description ??
            raw.plot ??
            raw.description,
        ),
      coverUrl:
        firstImage(
          info.cover ??
            info.cover_big ??
            raw.cover ??
            raw.cover_big,
        ),
      backdropUrl:
        firstImage(
          info.backdrop_path ??
            info.backdrop ??
            raw.backdrop_path ??
            raw.backdrop,
        ),
      year:
        release?.slice(0, 4) ??
        (
          info.year != null
            ? String(info.year).slice(0, 4)
            : null
        ),
      rating:
        numberFromUnknown(
          info.rating ??
            info.rating_5based,
        ),
      genre:
        stringOrNull(
          info.genre ??
            info.genres,
        ),
      cast:
        stringOrNull(
          info.cast ??
            info.actors,
        ),
      director:
        stringOrNull(
          info.director,
        ),
      durationMinutes:
        numberFromUnknown(
          info.episode_run_time ??
            info.duration_minutes,
        ),
      seasons,
    };

    this.cache.set(
      cacheKey,
      result,
      seasons.length > 0
        ? 15 * 60_000
        : 10_000,
    );

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