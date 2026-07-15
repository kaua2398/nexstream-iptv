'use client';

import { Hero } from '@/components/media/hero';
import { MediaRow } from '@/components/media/media-row';
import { useCatalog } from '@/hooks/use-catalog';

export default function DashboardPage() {
  const catalog = useCatalog();
  if (catalog.isPending) return <div className="space-y-8"><div className="h-[48vh] animate-pulse rounded-3xl bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /></div>;
  if (catalog.isError) return <div className="rounded-2xl border bg-card p-8">Não foi possível carregar o catálogo. Verifique o servidor e tente novamente.</div>;
  const data = catalog.data;
  return (
    <div className="space-y-10">
      <Hero item={data.movies[0] ?? data.live[0]} />
      <MediaRow title="TV ao vivo" items={data.live} />
      <MediaRow title="Filmes" items={data.movies} />
      <MediaRow title="Séries" items={data.series} />
    </div>
  );
}
