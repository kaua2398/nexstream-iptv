'use client';

import { Clock3, Play, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { BackButton } from '@/components/navigation/back-button';
import { Button } from '@/components/ui/button';
import { useSeriesDetails } from '@/hooks/use-series-details';
import { usePlayerStore } from '@/stores/player-store';

function durationLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export default function SeriesDetailsPage() {
  const params = useParams<{ id: string | string[] }>();
  const seriesId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const query = useSeriesDetails(seriesId);
  const open = usePlayerStore((state) => state.open);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const activeSeason = useMemo(() => {
    if (!query.data?.seasons.length) return null;
    return (
      query.data.seasons.find((season) => season.seasonNumber === selectedSeason) ??
      query.data.seasons[0]!
    );
  }, [query.data?.seasons, selectedSeason]);

  if (query.isPending) {
    return <div className="h-[70vh] animate-pulse rounded-3xl bg-muted" />;
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
  const firstEpisode = data.seasons[0]?.episodes[0];

  return (
    <div className="space-y-10 pb-12">
      <section className="relative min-h-[55vh] overflow-hidden rounded-3xl border bg-card">
        {data.backdropUrl || data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.backdropUrl ?? data.coverUrl ?? ''}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
        <div className="relative flex min-h-[55vh] flex-col justify-between p-6 sm:p-10">
          <BackButton fallback="/dashboard/series" />
          <div className="max-w-3xl text-white">
            <h1 className="text-4xl font-black sm:text-6xl">{data.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/70">
              {data.year && <span>{data.year}</span>}
              {data.rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-current text-amber-300" />
                  {data.rating.toFixed(1)}
                </span>
              )}
              {data.durationMinutes != null && <span>{data.durationMinutes} min por episódio</span>}
              {data.genre && <span>{data.genre}</span>}
            </div>
            {data.plot && <p className="mt-5 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">{data.plot}</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              {firstEpisode && (
                <Button
                  onClick={() =>
                    open({
                      id: firstEpisode.id,
                      type: 'episode',
                      title: `${data.title} — ${firstEpisode.title}`,
                      imageUrl: firstEpisode.imageUrl ?? data.coverUrl,
                      backdropUrl: data.backdropUrl,
                      categoryId: null,
                      year: data.year,
                      rating: firstEpisode.rating,
                    })
                  }
                >
                  <Play className="mr-2 size-4 fill-current" />
                  Assistir do início
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-black">Episódios</h2>
            <p className="mt-1 text-sm text-foreground/50">
              {data.seasons.length} {data.seasons.length === 1 ? 'temporada' : 'temporadas'} disponíveis
            </p>
          </div>
          <select
            value={activeSeason?.seasonNumber ?? ''}
            onChange={(event) => setSelectedSeason(Number(event.target.value))}
            className="rounded-xl border border-white/10 bg-card px-4 py-3 text-sm font-semibold outline-none"
          >
            {data.seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                {season.name}
              </option>
            ))}
          </select>
        </div>

        {activeSeason ? (
          <div className="space-y-3">
            {activeSeason.episodes.map((episode) => (
              <button
                key={episode.id}
                type="button"
                onClick={() =>
                  open({
                    id: episode.id,
                    type: 'episode',
                    title: `${data.title} — ${episode.title}`,
                    imageUrl: episode.imageUrl ?? activeSeason.coverUrl ?? data.coverUrl,
                    backdropUrl: data.backdropUrl,
                    categoryId: null,
                    year: data.year,
                    rating: episode.rating,
                  })
                }
                className="group grid w-full gap-4 rounded-2xl border border-white/5 bg-card/55 p-3 text-left transition hover:border-primary/50 hover:bg-card sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {episode.imageUrl || activeSeason.coverUrl || data.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={episode.imageUrl ?? activeSeason.coverUrl ?? data.coverUrl ?? ''}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                    <Play className="size-10 fill-white text-white" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-bold">
                    {episode.episodeNumber}. {episode.title}
                  </p>
                  {episode.plot && <p className="mt-2 line-clamp-2 text-sm leading-5 text-foreground/55">{episode.plot}</p>}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-foreground/45">
                    {durationLabel(episode.durationSeconds) && (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {durationLabel(episode.durationSeconds)}
                      </span>
                    )}
                    {episode.releaseDate && <span>{episode.releaseDate}</span>}
                    {episode.rating != null && <span>★ {episode.rating.toFixed(1)}</span>}
                  </div>
                </div>
                <Play className="hidden size-6 text-primary sm:block" />
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-card p-6 text-foreground/55">Nenhum episódio disponível.</p>
        )}
      </section>

      {(data.cast || data.director) && (
        <section className="grid gap-5 rounded-2xl border border-white/5 bg-card/45 p-6 sm:grid-cols-2">
          {data.cast && <div><p className="text-xs font-bold uppercase tracking-wider text-foreground/40">Elenco</p><p className="mt-2 text-sm leading-6">{data.cast}</p></div>}
          {data.director && <div><p className="text-xs font-bold uppercase tracking-wider text-foreground/40">Direção</p><p className="mt-2 text-sm leading-6">{data.director}</p></div>}
        </section>
      )}
    </div>
  );
}
