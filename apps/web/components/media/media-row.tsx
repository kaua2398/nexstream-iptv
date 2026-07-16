import type { MediaCardDto } from '@nexstream/shared';
import { MediaCard } from './media-card';

interface MediaRowProps {
  title: string;
  items: MediaCardDto[];
}

export function MediaRow({
  title,
  items,
}: MediaRowProps) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="min-w-0 space-y-4">
      <h2 className="px-1 text-xl font-bold tracking-tight">
        {title}
      </h2>

      <div className="media-scroll flex min-w-0 gap-4 overflow-x-auto px-1 pb-5 pt-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="w-40 shrink-0 sm:w-44 lg:w-48"
          >
            <MediaCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}