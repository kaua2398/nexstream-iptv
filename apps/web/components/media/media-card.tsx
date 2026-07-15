'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { motion } from 'framer-motion';
import { Play, Tv } from 'lucide-react';
import { usePlayerStore } from '@/stores/player-store';

export function MediaCard({ item }: { item: MediaCardDto }) {
  const open = usePlayerStore((state) => state.open);
  const playable = item.type !== 'series';
  return (
    <motion.button
      whileHover={{ y: -7, scale: 1.025 }}
      transition={{ duration: 0.18 }}
      className="group relative aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-xl bg-muted text-left shadow-lg sm:w-44"
      onClick={() => playable && open(item)}
      aria-label={playable ? `Reproduzir ${item.title}` : `Abrir ${item.title}`}
    >
      {item.imageUrl ? (
        // The URL is an authenticated same-origin image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-black/70">
          <Tv className="size-12 text-foreground/20" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-80" />
      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-white/65">
          {playable && <Play className="size-3 fill-current" />}
          {item.year && <span>{item.year}</span>}
          {item.rating != null && <span>★ {item.rating.toFixed(1)}</span>}
        </div>
      </div>
    </motion.button>
  );
}
