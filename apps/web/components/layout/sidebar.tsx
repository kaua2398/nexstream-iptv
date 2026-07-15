'use client';

import {
  Clock3,
  Film,
  Heart,
  Home,
  LibraryBig,
  LogOut,
  Menu,
  Settings,
  Tv,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/services/api';
import { cn } from '@/services/utils';

const links = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/dashboard/tv', label: 'TV', icon: Tv },
  { href: '/dashboard/movies', label: 'Filmes', icon: Film },
  { href: '/dashboard/series', label: 'Séries', icon: LibraryBig },
  { href: '/dashboard/favorites', label: 'Favoritos', icon: Heart },
  { href: '/dashboard/history', label: 'Histórico', icon: Clock3 },
  { href: '/dashboard/settings', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }

  return (
    <>
      <button
        className="fixed left-4 top-4 z-40 rounded-xl bg-card p-3 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card/95 p-5 backdrop-blur-xl transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/dashboard" className="text-xl font-black tracking-tight">
            <span className="text-primary">N</span>exStream
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition',
                  active
                    ? 'bg-primary text-white'
                    : 'text-foreground/60 hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-5" />
          Sair
        </button>
      </aside>
    </>
  );
}