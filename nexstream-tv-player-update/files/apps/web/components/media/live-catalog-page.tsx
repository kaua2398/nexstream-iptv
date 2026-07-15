'use client';

import {
  ChevronLeft,
  ChevronRight,
  Search,
  Tv,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CatalogCategoryDto } from '@nexstream/shared';
import { Input } from '@/components/ui/input';
import { LiveChannelCard } from '@/components/media/live-channel-card';
import { useBrowseCatalog } from '@/hooks/use-browse-catalog';
import { cn } from '@/services/utils';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

const quickFilterRules: RegExp[] = [
  /abert|globo|sbt|band|record/,
  /jornal|not[ií]cia/,
  /esport|sport|espn|premiere|nba/,
  /filmes|s[eé]ries|telecine|hbo|cinema/,
  /infantil|desenho|kids/,
  /4k/,
  /24h/,
];

function pickQuickCategories(
  categories: CatalogCategoryDto[],
): CatalogCategoryDto[] {
  const selected: CatalogCategoryDto[] = [];
  const used = new Set<string>();

  for (const rule of quickFilterRules) {
    const match = categories.find((category) => {
      return !used.has(category.id) && rule.test(normalize(category.name));
    });

    if (match) {
      selected.push(match);
      used.add(match.id);
    }
  }

  return selected.slice(0, 7);
}

export function LiveCatalogPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [search]);

  const catalog = useBrowseCatalog({
    type: 'live',
    categoryId,
    query: debouncedSearch,
    page,
    limit: 48,
  });

  const categories = catalog.data?.categories ?? [];

  const visibleCategories = useMemo(() => {
    const term = normalize(categorySearch);
    if (!term) return categories;

    return categories.filter((category) =>
      normalize(category.name).includes(term),
    );
  }, [categories, categorySearch]);

  const quickCategories = useMemo(
    () => pickQuickCategories(categories),
    [categories],
  );

  function selectCategory(id: string | null) {
    setCategoryId(id);
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Tv className="size-6" />
          </span>
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">TV ao vivo</h1>
            <p className="mt-1 text-sm text-foreground/50">
              {(catalog.data?.allTotal ?? 0).toLocaleString('pt-BR')} canais disponíveis
            </p>
          </div>
        </div>

        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar canais…"
            className="pl-10"
          />
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => selectCategory(null)}
          className={cn(
            'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition',
            categoryId === null
              ? 'border-primary bg-primary text-white'
              : 'border-white/10 bg-card text-foreground/65 hover:border-primary/50 hover:text-foreground',
          )}
        >
          Todos
        </button>

        {quickCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => selectCategory(category.id)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition',
              categoryId === category.id
                ? 'border-primary bg-primary text-white'
                : 'border-white/10 bg-card text-foreground/65 hover:border-primary/50 hover:text-foreground',
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="flex h-full max-h-[70vh] flex-col rounded-2xl border border-white/5 bg-card/50 p-3 lg:max-h-none">
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
                <span>Todos os canais</span>
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

        <main className="min-w-0 space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">
                {categoryId ? 'Canais da categoria' : 'Todos os canais'}
              </h2>
              <p className="mt-1 text-sm text-foreground/45">
                {(catalog.data?.total ?? 0).toLocaleString('pt-BR')} resultados
              </p>
            </div>
            {catalog.isFetching && (
              <span className="text-xs text-foreground/45">Atualizando…</span>
            )}
          </div>

          {catalog.isPending && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 12 }, (_, index) => (
                <div key={index} className="aspect-video animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          )}

          {catalog.isError && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-200">
              Não foi possível carregar os canais. Atualize a página e tente novamente.
            </div>
          )}

          {catalog.data && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {catalog.data.items.map((item) => (
                  <LiveChannelCard key={item.id} item={item} />
                ))}
              </div>

              {!catalog.data.items.length && (
                <p className="rounded-xl bg-card p-6 text-foreground/60">
                  Nenhum canal encontrado.
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
