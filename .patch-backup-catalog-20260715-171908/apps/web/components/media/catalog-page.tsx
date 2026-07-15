'use client';

import { useMemo, useState } from 'react';
import type { MediaCardDto } from '@nexstream/shared';
import { Input } from '@/components/ui/input';
import { MediaCard } from '@/components/media/media-card';

export function CatalogPage({ title, items }: { title: string; items: MediaCardDto[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return normalized ? items.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(normalized)) : items;
  }, [items, query]);
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.25em] text-primary">Catálogo</p><h1 className="mt-2 text-4xl font-black">{title}</h1></div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar em ${title.toLowerCase()}…`} className="max-w-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {filtered.map((item) => <MediaCard key={item.id} item={item} />)}
      </div>
      {!filtered.length && <p className="rounded-xl bg-card p-6 text-foreground/60">Nenhum resultado encontrado.</p>}
    </div>
  );
}
