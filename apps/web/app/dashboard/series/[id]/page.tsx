'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  Play,
  RotateCcw,
  Star,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import {
  useMemo,
  useState,
} from 'react';
import { BackButton } from '@/components/navigation/back-button';
import { Button } from '@/components/ui/button';
import { useSeriesDetails } from '@/hooks/use-series-details';
import { api } from '@/services/api';
import { usePlayerStore } from '@/stores/player-store';

interface HistoryRow {
  mediaId: string;
  mediaType: 'live' | 'movie' | 'episode';
  title: string;
  imageUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

function durationLabel(
  seconds: number | null,
): string | null {
  if (seconds == null) {
    return null;
  }

  const minutes = Math.max(
    1,
    Math.round(seconds / 60),
  );

  return `${minutes} min`;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '00:00';
  }

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(
    (total % 3600) / 60,
  );
  const seconds = total % 60;

  if (hours > 0) {
    return [
      String(hours),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].join(':');
  }

  return [
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

function historyProgress(
  history: HistoryRow | undefined,
): number {
  if (
    !history ||
    history.durationSeconds <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      history.positionSeconds /
        history.durationSeconds,
    ),
  );
}

function isEpisodeWatched(
  history: HistoryRow | undefined,
): boolean {
  return Boolean(
    history?.completed ||
      historyProgress(history) >= 0.9,
  );
}

function isEpisodeStarted(
  history: HistoryRow | undefined,
): boolean {
  return Boolean(
    history &&
      history.positionSeconds >= 10 &&
      !isEpisodeWatched(history),
  );
}

export default function SeriesDetailsPage() {
  const params =
    useParams<{
      id: string | string[];
    }>();

  const seriesId = Array.isArray(params.id)
    ? (params.id[0] ?? '')
    : (params.id ?? '');

  const query =
    useSeriesDetails(seriesId);

  const historyQuery = useQuery({
    queryKey: ['history'],
    queryFn: () =>
      api.get<{ items: HistoryRow[] }>(
        '/library/history',
      ),
    staleTime: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const open =
    usePlayerStore(
      (state) => state.open,
    );

  const [
    selectedSeason,
    setSelectedSeason,
  ] = useState<number | null>(null);

  const activeSeason = useMemo(() => {
    if (!query.data?.seasons.length) {
      return null;
    }

    return (
      query.data.seasons.find(
        (season) =>
          season.seasonNumber ===
          selectedSeason,
      ) ??
      query.data.seasons[0]!
    );
  }, [
    query.data?.seasons,
    selectedSeason,
  ]);

  const episodeQueue =
    useMemo<MediaCardDto[]>(() => {
      const data = query.data;

      if (!data) {
        return [];
      }

      return [...data.seasons]
        .sort(
          (a, b) =>
            a.seasonNumber -
            b.seasonNumber,
        )
        .flatMap((season) =>
          [...season.episodes]
            .sort(
              (a, b) =>
                a.episodeNumber -
                b.episodeNumber,
            )
            .map((episode) => ({
              id: episode.id,
              type: 'episode' as const,
              title:
                `${data.title} — ` +
                `S${String(
                  season.seasonNumber,
                ).padStart(2, '0')}` +
                `E${String(
                  episode.episodeNumber,
                ).padStart(2, '0')}` +
                ` — ${episode.title}`,
              imageUrl:
                episode.imageUrl ??
                season.coverUrl ??
                data.coverUrl,
              backdropUrl:
                data.backdropUrl,
              categoryId: null,
              year: data.year,
              rating: episode.rating,
            })),
        );
    }, [query.data]);

  const historyMap = useMemo(() => {
    return new Map(
      (historyQuery.data?.items ?? [])
        .filter(
          (item) =>
            item.mediaType === 'episode',
        )
        .map(
          (item) =>
            [item.mediaId, item] as const,
        ),
    );
  }, [historyQuery.data?.items]);

  const watchedEpisodeCount = useMemo(() => {
    return episodeQueue.filter(
      (episode) =>
        isEpisodeWatched(
          historyMap.get(episode.id),
        ),
    ).length;
  }, [
    episodeQueue,
    historyMap,
  ]);

  const nextEpisode = useMemo(() => {
    const started =
      episodeQueue.find(
        (episode) =>
          isEpisodeStarted(
            historyMap.get(episode.id),
          ),
      );

    if (started) {
      return started;
    }

    const firstUnwatched =
      episodeQueue.find(
        (episode) =>
          !isEpisodeWatched(
            historyMap.get(episode.id),
          ),
      );

    return (
      firstUnwatched ??
      episodeQueue[0] ??
      null
    );
  }, [
    episodeQueue,
    historyMap,
  ]);

  const nextEpisodeHistory =
    nextEpisode
      ? historyMap.get(nextEpisode.id)
      : undefined;

  const allEpisodesWatched =
    episodeQueue.length > 0 &&
    watchedEpisodeCount ===
      episodeQueue.length;

  const openEpisode = (
    episodeId: string,
  ) => {
    const episode =
      episodeQueue.find(
        (item) =>
          item.id === episodeId,
      );

    if (!episode) {
      return;
    }

    open(
      episode,
      episodeQueue,
    );
  };

  if (query.isPending) {
    return (
      <div className="h-[70vh] animate-pulse rounded-3xl bg-muted" />
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <BackButton fallback="/dashboard/series" />

        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-red-100">
          Não foi possível carregar as temporadas desta série.
        </div>
      </div>
    );
  }

  const data = query.data;

  const activeSeasonWatched =
    activeSeason?.episodes.filter(
      (episode) =>
        isEpisodeWatched(
          historyMap.get(episode.id),
        ),
    ).length ?? 0;

  return (
    <div className="space-y-10 pb-12">
      <section className="relative min-h-[55vh] overflow-hidden rounded-3xl border bg-card">
        {data.backdropUrl ||
        data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              data.backdropUrl ??
              data.coverUrl ??
              ''
            }
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />

        <div className="relative flex min-h-[55vh] flex-col justify-between p-6 sm:p-10">
          <BackButton fallback="/dashboard/series" />

          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-black sm:text-6xl">
              {data.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/70">
              {data.year && (
                <span>{data.year}</span>
              )}

              {data.rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-current text-amber-300" />
                  {data.rating.toFixed(1)}
                </span>
              )}

              {data.durationMinutes != null &&
                data.durationMinutes > 0 && (
                  <span>
                    {data.durationMinutes} min por episódio
                  </span>
                )}

              {data.genre && (
                <span>{data.genre}</span>
              )}
            </div>

            {data.plot && (
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
                {data.plot}
              </p>
            )}

            {episodeQueue.length > 0 && (
              <div className="mt-5 max-w-md">
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span>
                    {watchedEpisodeCount} de{' '}
                    {episodeQueue.length}{' '}
                    episódios assistidos
                  </span>

                  <span>
                    {Math.round(
                      (
                        watchedEpisodeCount /
                        episodeQueue.length
                      ) * 100,
                    )}
                    %
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{
                      width:
                        `${(
                          watchedEpisodeCount /
                          episodeQueue.length
                        ) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              {nextEpisode && (
                <Button
                  onClick={() => {
                    open(
                      nextEpisode,
                      episodeQueue,
                    );
                  }}
                >
                  {allEpisodesWatched ? (
                    <RotateCcw className="mr-2 size-4" />
                  ) : (
                    <Play className="mr-2 size-4 fill-current" />
                  )}

                  {allEpisodesWatched
                    ? 'Reassistir série'
                    : isEpisodeStarted(
                        nextEpisodeHistory,
                      )
                      ? `Continuar de ${formatTime(
                          nextEpisodeHistory
                            ?.positionSeconds ??
                            0,
                        )}`
                      : watchedEpisodeCount > 0
                        ? 'Continuar série'
                        : 'Assistir do início'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-black">
              Episódios
            </h2>

            <p className="mt-1 text-sm text-foreground/50">
              {data.seasons.length}{' '}
              {data.seasons.length === 1
                ? 'temporada'
                : 'temporadas'}{' '}
              disponíveis
            </p>

            {activeSeason && (
              <p className="mt-1 text-xs text-foreground/40">
                {activeSeasonWatched} de{' '}
                {activeSeason.episodes.length}{' '}
                assistidos nesta temporada
              </p>
            )}
          </div>

          <select
            value={
              activeSeason?.seasonNumber ??
              ''
            }
            onChange={(event) => {
              setSelectedSeason(
                Number(event.target.value),
              );
            }}
            className="rounded-xl border border-white/10 bg-card px-4 py-3 text-sm font-semibold outline-none"
          >
            {data.seasons.map(
              (season) => (
                <option
                  key={season.seasonNumber}
                  value={
                    season.seasonNumber
                  }
                >
                  {season.name}
                </option>
              ),
            )}
          </select>
        </div>

        {activeSeason ? (
          <div className="space-y-3">
            {activeSeason.episodes.map(
              (episode) => {
                const episodeHistory =
                  historyMap.get(
                    episode.id,
                  );

                const progress =
                  historyProgress(
                    episodeHistory,
                  );

                const watched =
                  isEpisodeWatched(
                    episodeHistory,
                  );

                const started =
                  isEpisodeStarted(
                    episodeHistory,
                  );

                return (
                  <button
                    key={episode.id}
                    type="button"
                    onClick={() => {
                      openEpisode(
                        episode.id,
                      );
                    }}
                    className="group relative grid w-full gap-4 overflow-hidden rounded-2xl border border-white/5 bg-card/55 p-3 text-left transition hover:border-primary/50 hover:bg-card sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                      {episode.imageUrl ||
                      activeSeason.coverUrl ||
                      data.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            episode.imageUrl ??
                            activeSeason.coverUrl ??
                            data.coverUrl ??
                            ''
                          }
                          alt=""
                          loading="lazy"
                          className={`h-full w-full object-cover transition ${
                            watched
                              ? 'opacity-55'
                              : ''
                          }`}
                        />
                      ) : null}

                      {watched && (
                        <div className="absolute inset-0 grid place-items-center bg-black/35">
                          <div className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur">
                            <CheckCircle2 className="size-5 text-green-400" />
                            Assistido
                          </div>
                        </div>
                      )}

                      {!watched && (
                        <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                          <Play className="size-10 fill-white text-white" />
                        </div>
                      )}

                      {(started || watched) && (
                        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                          <div
                            className={`h-full ${
                              watched
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                            style={{
                              width:
                                `${watched
                                  ? 100
                                  : progress * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">
                          {episode.episodeNumber}.{' '}
                          {episode.title}
                        </p>

                        {watched && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-green-300">
                            <CheckCircle2 className="size-3" />
                            Assistido
                          </span>
                        )}

                        {started && (
                          <span className="rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-300">
                            Em andamento
                          </span>
                        )}
                      </div>

                      {episode.plot && (
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-foreground/55">
                          {episode.plot}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-foreground/45">
                        {durationLabel(
                          episode.durationSeconds,
                        ) && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" />
                            {durationLabel(
                              episode.durationSeconds,
                            )}
                          </span>
                        )}

                        {episode.releaseDate && (
                          <span>
                            {episode.releaseDate}
                          </span>
                        )}

                        {episode.rating != null && (
                          <span>
                            ★{' '}
                            {episode.rating.toFixed(
                              1,
                            )}
                          </span>
                        )}

                        {started &&
                          episodeHistory && (
                            <span className="font-semibold text-red-300">
                              Continuar de{' '}
                              {formatTime(
                                episodeHistory
                                  .positionSeconds,
                              )}
                            </span>
                          )}

                        {watched && (
                          <span className="font-semibold text-green-300">
                            Concluído
                          </span>
                        )}
                      </div>
                    </div>

                    {watched ? (
                      <RotateCcw className="hidden size-6 text-green-400 sm:block" />
                    ) : (
                      <Play className="hidden size-6 text-primary sm:block" />
                    )}

                    {(started || watched) && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                        <div
                          className={`h-full transition-all ${
                            watched
                              ? 'bg-green-500'
                              : 'bg-red-500'
                          }`}
                          style={{
                            width:
                              `${watched
                                ? 100
                                : progress * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              },
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-card p-6 text-foreground/55">
            Nenhum episódio disponível.
          </p>
        )}
      </section>

      {(data.cast ||
        data.director) && (
        <section className="grid gap-5 rounded-2xl border border-white/5 bg-card/45 p-6 sm:grid-cols-2">
          {data.cast && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-foreground/40">
                Elenco
              </p>

              <p className="mt-2 text-sm leading-6">
                {data.cast}
              </p>
            </div>
          )}

          {data.director && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-foreground/40">
                Direção
              </p>

              <p className="mt-2 text-sm leading-6">
                {data.director}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}