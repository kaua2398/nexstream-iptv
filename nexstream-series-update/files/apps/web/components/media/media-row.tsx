import type { MediaCardDto } from '@nexstream/shared';
import { MediaCard } from './media-card';

export function MediaRow({ title, items }: { title: string; items: MediaCardDto[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-4">
      {title ? <h2 className="px-1 text-xl font-bold tracking-tight">{title}</h2> : null}
      <div className="media-scroll flex gap-4 overflow-x-auto px-1 pb-5 pt-1">
        {items.map((item) => <MediaCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}
