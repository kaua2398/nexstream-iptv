'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { motion } from 'framer-motion';
import { Clapperboard, Play, Tv } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePlayerStore } from '@/stores/player-store';

export function MediaCard({ item }: { item: MediaCardDto }) {
  const open = usePlayerStore((state) => state.open);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const playable = item.type !== 'series';

  function activate() {
    if (item.type !== 'series') {
      open(item);
      return;
    }

    const query = searchParams.toString();
    const returnTo = query ? `${pathname}?${query}` : pathname;
    sessionStorage.setItem(
      `nexstream:scroll:${returnTo}`,
      String(window.scrollY),
    );
    router.push(
      `/dashboard/series/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return (
    <motion.button
      whileHover={{ y: -7, scale: 1.025 }}
      transition={{ duration: 0.18 }}
      className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted text-left shadow-lg"
      onClick={activate}
      aria-label={playable ? `Reproduzir ${item.title}` : `Abrir ${item.title}`}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-black/70">
          {item.type === 'series' ? (
            <Clapperboard className="size-12 text-foreground/20" />
          ) : (
            <Tv className="size-12 text-foreground/20" />
          )}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-80" />
      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-white/65">
          {playable ? <Play className="size-3 fill-current" /> : <Clapperboard className="size-3" />}
          {item.year && <span>{item.year}</span>}
          {item.rating != null && <span>★ {item.rating.toFixed(1)}</span>}
        </div>
      </div>
      {typeof item.progress === 'number' &&
        item.progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div
              className="h-full bg-red-600"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    item.progress * 100,
                  ),
                )}%`,
              }}
            />
          </div>
        )}
    </motion.button>
  );
}
