'use client';
import { CatalogPage } from '@/components/media/catalog-page';
import { useCatalog } from '@/hooks/use-catalog';
export default function TvPage() { const query = useCatalog(); return query.data ? <CatalogPage title="TV ao vivo" items={query.data.live} /> : <p>Carregando…</p>; }
