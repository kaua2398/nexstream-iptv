import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/providers/query-provider';
import { ServiceWorkerRegistration } from '@/providers/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'NexStream', template: '%s · NexStream' },
  description: 'Player pessoal para provedores Xtream Codes autorizados.',
  applicationName: 'NexStream',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0b0c10',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
