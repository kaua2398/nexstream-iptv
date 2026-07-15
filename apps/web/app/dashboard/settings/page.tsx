'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const saved = localStorage.getItem('nexstream-theme');
    if (saved === 'light') setTheme('light');
  }, []);
  function apply(next: 'dark' | 'light') {
    setTheme(next);
    localStorage.setItem('nexstream-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div><p className="text-xs font-bold uppercase tracking-[.25em] text-primary">Preferências</p><h1 className="mt-2 text-4xl font-black">Configurações</h1></div>
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">Aparência</h2>
        <p className="mt-1 text-sm text-foreground/55">Apenas preferências não sensíveis são armazenadas neste navegador.</p>
        <div className="mt-5 flex gap-3">
          <Button variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => apply('dark')}>Escuro</Button>
          <Button variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => apply('light')}>Claro</Button>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">Segurança</h2>
        <p className="mt-2 text-sm leading-6 text-foreground/60">Credenciais Xtream, tokens e URLs reais de reprodução não são armazenados no localStorage, sessionStorage ou IndexedDB.</p>
      </section>
    </div>
  );
}
