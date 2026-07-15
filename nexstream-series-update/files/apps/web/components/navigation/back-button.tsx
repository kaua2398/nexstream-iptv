'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goBack() {
    const requested = searchParams.get('returnTo');
    const destination = requested?.startsWith('/dashboard') ? requested : fallback;
    router.push(destination);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white hover:text-black"
    >
      <ArrowLeft className="size-4" />
      Voltar
    </button>
  );
}
