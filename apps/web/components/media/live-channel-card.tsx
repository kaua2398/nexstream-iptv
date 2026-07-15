'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { motion } from 'framer-motion';
import { Play, Tv } from 'lucide-react';
import { usePlayerStore } from '@/stores/player-store';

export function LiveChannelCard({ item }: { item: MediaCardDto }) {
  const open = usePlayerStore((state) => state.open);

  return (
    <motion.button
      type="button"
      whileHover={{ y: -5, scale: 1.015 }}
      transition={{ duration: 0.16 }}
      onClick={() => open(item)}
      className="group overflow-hidden rounded-2xl border border-white/8 bg-card text-left shadow-lg transition hover:border-primary/45"
      aria-label={`Assistir ${item.title}`}
    >
      <div className="relative aspect-video overflow-hidden bg-black/45">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-black/80">
            <Tv className="size-12 text-foreground/20" />
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-md bg-red-500 px-2 py-1 text-[10px] font-black tracking-wide text-white">
          AO VIVO
        </span>

        <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover:opacity-100">
          <span className="grid size-12 place-items-center rounded-full bg-white text-black shadow-xl">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      </div>

      <div className="p-4">
        <p className="line-clamp-2 min-h-10 text-sm font-bold leading-5">
          {item.title}
        </p>
      </div>
    </motion.button>
  );
}
