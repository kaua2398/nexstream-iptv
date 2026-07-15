'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { Play, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayerStore } from '@/stores/player-store';

export function Hero({ item }: { item: MediaCardDto | undefined }) {
  const open = usePlayerStore((state) => state.open);
  if (!item) return <div className="h-[48vh] min-h-80 animate-pulse rounded-3xl bg-muted" />;
  return (
    <section className="relative flex min-h-[48vh] items-end overflow-hidden rounded-3xl border bg-card p-7 sm:p-12">
      {item.backdropUrl || item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.backdropUrl ?? item.imageUrl ?? ''}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/65 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="relative max-w-2xl text-white">
        <p className="mb-3 text-xs font-bold uppercase tracking-[.28em] text-primary">Em destaque</p>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{item.title}</h1>
        <p className="mt-4 max-w-xl text-sm text-white/70 sm:text-base">
          Continue de onde parou ou descubra os conteúdos disponíveis na sua assinatura autorizada.
        </p>
        <div className="mt-7 flex gap-3">
          <Button onClick={() => open(item)}><Play className="mr-2 size-4 fill-current" />Assistir</Button>
          <Button variant="secondary"><Plus className="mr-2 size-4" />Favoritar</Button>
        </div>
      </div>
    </section>
  );
}
