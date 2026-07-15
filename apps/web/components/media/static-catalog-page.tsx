'use client';

import type { MediaCardDto } from '@nexstream/shared';
import { MediaCard } from '@/components/media/media-card';

interface StaticCatalogPageProps {
  title: string;
  items: MediaCardDto[];
}

export function StaticCatalogPage({
  title,
  items,
}: StaticCatalogPageProps) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-black">
          {title}
        </h1>

        <p className="mt-2 text-sm text-foreground/55">
          {items.length.toLocaleString('pt-BR')}{' '}
          {items.length === 1
            ? 'título'
            : 'títulos'}
        </p>
      </header>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-card p-6 text-foreground/60">
          Nenhum conteúdo encontrado.
        </p>
      )}
    </div>
  );
}