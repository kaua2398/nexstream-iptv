'use client';

import Hls from 'hls.js';
import { Maximize, Minimize2, Pause, PictureInPicture, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { usePlayerStore } from '@/stores/player-store';

export function VideoPlayer() {
  const { media, minimized, close, setMinimized } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    setError(null);
    setSource(null);
    void api
      .post<{ url: string }>('/playback/token', { mediaId: media.id })
      .then((result) => setSource(result.url))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Falha na reprodução.'));
  }, [media]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError('O stream foi interrompido.');
      });
      hlsRef.current = hls;
    } else {
      setError('Este navegador não suporta reprodução HLS.');
    }
    void video.play().catch(() => undefined);
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [source]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || !media) return;
      if (event.code === 'Space') { event.preventDefault(); void (video.paused ? video.play() : video.pause()); }
      if (event.key === 'ArrowRight') video.currentTime += 10;
      if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
      if (event.key.toLowerCase() === 'm') video.muted = !video.muted;
      if (event.key.toLowerCase() === 'f') void video.requestFullscreen();
      if (event.key === 'Escape') minimized ? setMinimized(false) : close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, media, minimized, setMinimized]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !media || media.type === 'live') return;
    const timer = window.setInterval(() => {
      if (!Number.isFinite(video.duration) || video.currentTime <= 0) return;
      void api.put('/library/history', {
        mediaId: media.id,
        mediaType: media.type,
        title: media.title,
        imageUrl: media.imageUrl,
        positionSeconds: Math.floor(video.currentTime),
        durationSeconds: Math.floor(video.duration),
        watchedSeconds: Math.floor(video.currentTime),
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [media]);

  if (!media) return null;
  const video = videoRef.current;

  return (
    <div
      className={minimized
        ? 'fixed bottom-5 right-5 z-50 aspect-video w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-black shadow-glow'
        : 'fixed inset-0 z-50 grid place-items-center bg-black/95 p-0 sm:p-6'}
    >
      <div className="group relative h-full w-full max-w-7xl overflow-hidden bg-black sm:rounded-2xl">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          controls={false}
        />
        {!source && !error && <div className="absolute inset-0 grid place-items-center text-white/70">Preparando stream…</div>}
        {error && <div className="absolute inset-0 grid place-items-center p-8 text-center text-white">{error}</div>}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black via-black/75 to-transparent p-4 pt-12 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button aria-label={playing ? 'Pausar' : 'Reproduzir'} onClick={() => void (video?.paused ? video.play() : video?.pause())}>
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </button>
          <button aria-label={muted ? 'Ativar som' : 'Silenciar'} onClick={() => { if (video) video.muted = !video.muted; }}>
            {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
          </button>
          <p className="ml-2 min-w-0 flex-1 truncate text-sm font-semibold">{media.title}</p>
          <button aria-label="Picture in Picture" onClick={() => void video?.requestPictureInPicture?.()}><PictureInPicture className="size-5" /></button>
          <button aria-label={minimized ? 'Expandir' : 'Minimizar'} onClick={() => setMinimized(!minimized)}>
            {minimized ? <Maximize className="size-5" /> : <Minimize2 className="size-5" />}
          </button>
          <button aria-label="Fechar" onClick={close}><X className="size-6" /></button>
        </div>
      </div>
    </div>
  );
}
