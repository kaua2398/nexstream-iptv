'use client';

import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BrowseCatalogType } from '@nexstream/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { MediaCard } from '@/components/media/media-card';
import { MediaRow } from '@/components/media/media-row';
import { useBrowseCatalog } from '@/hooks/use-browse-catalog';
import { cn } from '@/services/utils';

interface CatalogPageProps {
  title: string;
  type: BrowseCatalogType;
}

function positivePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function CatalogPage({ title, type }: CatalogPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categoryId, setCategoryId] = useState<string | null>(
    searchParams.get('category'),
  );
  const [page, setPage] = useState(() => positivePage(searchParams.get('page')));
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') ?? '');
  const [categorySearch, setCategorySearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (categoryId) params.set('category', categoryId);
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (page > 1) params.set('page', String(page));
    const next = params.size ? `${pathname}?${params.toString()}` : pathname;
    router.replace(next, { scroll: false });
  }, [categoryId, debouncedSearch, page, pathname, router]);

  const catalog = useBrowseCatalog({
    type,
    categoryId,
    query: debouncedSearch,
    page,
    limit: 48,
  });

  useEffect(() => {
    if (!catalog.data) return;
    const key = `nexstream:scroll:${window.location.pathname}${window.location.search}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return;
    sessionStorage.removeItem(key);
    const position = Number(stored);
    if (Number.isFinite(position)) {
      requestAnimationFrame(() => window.scrollTo({ top: position }));
    }
  }, [catalog.data]);

  const visibleCategories = useMemo(() => {
    const normalized = categorySearch
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
    const categories = catalog.data?.categories ?? [];
    return normalized
      ? categories.filter((category) =>
          category.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pt-BR')
            .includes(normalized),
        )
      : categories;
  }, [catalog.data?.categories, categorySearch]);

  const allLabel = type === 'movie' ? 'Todos os filmes' : 'Todas as séries';

  function selectCategory(id: string | null) {
    setCategoryId(id);
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-foreground/50">
            {(catalog.data?.allTotal ?? 0).toLocaleString('pt-BR')} títulos disponíveis
          </p>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar ${title.toLocaleLowerCase('pt-BR')}…`}
            className="pl-10"
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-card/50 p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/35" />
              <Input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Buscar categorias…"
                className="pl-10"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => selectCategory(null)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
                  categoryId === null
                    ? 'bg-primary text-white'
                    : 'text-foreground/65 hover:bg-muted hover:text-foreground',
                )}
              >
                <span>{allLabel}</span>
                <span className="text-xs opacity-60">
                  {(catalog.data?.allTotal ?? 0).toLocaleString('pt-BR')}
                </span>
              </button>
              {visibleCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                    categoryId === category.id
                      ? 'bg-primary text-white'
                      : 'text-foreground/60 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="min-w-0 truncate">{category.name}</span>
                  <span className="shrink-0 text-xs opacity-55">
                    {category.count.toLocaleString('pt-BR')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-8">
          {catalog.isPending && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 12 }, (_, index) => (
                <div key={index} className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {catalog.isError && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-200">
              Não foi possível carregar este catálogo. Atualize a página e tente novamente.
            </div>
          )}

          {catalog.data && (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <h2 className="text-xl font-bold">Adicionados recentemente</h2>
                </div>
                <MediaRow title="" items={catalog.data.recentItems} />
              </section>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {categoryId ? 'Resultados da categoria' : allLabel}
                  </h2>
                  <p className="mt-1 text-sm text-foreground/45">
                    {catalog.data.total.toLocaleString('pt-BR')} resultados
                  </p>
                </div>
                {catalog.isFetching && <span className="text-xs text-foreground/45">Atualizando…</span>}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                {catalog.data.items.map((item) => (
                  <MediaCard key={item.id} item={item} />
                ))}
              </div>

              {!catalog.data.items.length && (
                <p className="rounded-xl bg-card p-6 text-foreground/60">
                  Nenhum resultado encontrado.
                </p>
              )}

              {catalog.data.totalPages > 1 && (
                <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Paginação">
                  <button
                    type="button"
                    disabled={catalog.data.page <= 1 || catalog.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                    Anterior
                  </button>
                  <span className="text-sm text-foreground/60">
                    Página {catalog.data.page} de {catalog.data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={catalog.data.page >= catalog.data.totalPages || catalog.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próxima
                    <ChevronRight className="size-4" />
                  </button>
                </nav>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
