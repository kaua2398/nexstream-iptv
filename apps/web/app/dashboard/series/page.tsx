'use client';
import { CatalogPage } from '@/components/media/catalog-page';
import { useCatalog } from '@/hooks/use-catalog';
export default function SeriesPage() { const query = useCatalog(); return query.data ? <CatalogPage title="Séries" items={query.data.series} /> : <p>Carregando…</p>; }
