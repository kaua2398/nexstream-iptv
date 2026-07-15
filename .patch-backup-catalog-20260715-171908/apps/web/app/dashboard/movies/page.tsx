'use client';
import { CatalogPage } from '@/components/media/catalog-page';
import { useCatalog } from '@/hooks/use-catalog';
export default function MoviesPage() { const query = useCatalog(); return query.data ? <CatalogPage title="Filmes" items={query.data.movies} /> : <p>Carregando…</p>; }
