import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NexStream IPTV',
    short_name: 'NexStream',
    description: 'Player pessoal para provedores Xtream Codes autorizados.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0b0c10',
    theme_color: '#0b0c10',
    icons: [
      { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
  };
}
