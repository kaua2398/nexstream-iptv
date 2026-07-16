'use client';

import Hls from 'hls.js';
import {
  ArrowLeft,
  Maximize,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '@/services/api';
import { usePlayerStore } from '@/stores/player-store';

interface PlaybackTicket {
  url: string;
  expiresIn: number;
  mode: 'hls' | 'file';
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '00:00';

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }

  return [minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function VideoPlayer() {
  const {
    media,
    minimized,
    close,
    setMinimized,
  } = usePlayerStore();

  const playerContainerRef =

    useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [ticket, setTicket] =
    useState<PlaybackTicket | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] =
    useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isLive = media?.type === 'live';
  const canSeek = Boolean(
    !isLive && Number.isFinite(duration) && duration > 0,
  );

  const progressPercent = useMemo(() => {
    if (!canSeek) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [canSeek, currentTime, duration]);

  const bufferedPercent = useMemo(() => {
    if (!canSeek) return 0;
    return Math.min(100, Math.max(0, (buffered / duration) * 100));
  }, [buffered, canSeek, duration]);
  const toggleFullscreen = useCallback(async () => {
    const container = playerContainerRef.current;

    if (!container) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }

      setError(null);
    } catch {
      setError(
        'Não foi possível ativar a tela cheia.',
      );
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement ===
          playerContainerRef.current,
      );
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      );
    };
  }, []);

  const playSafely = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      await video.play();
      setError(null);
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        caught.name === 'NotAllowedError'
      ) {
        return;
      }

      setError('O navegador não conseguiu iniciar esta mídia.');
    }
  }, []);

  const saveProgress = useCallback(() => {
    const video = videoRef.current;

    if (
      !video ||
      !media ||
      media.type === 'live' ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.currentTime <= 0
    ) {
      return;
    }

    void api.put('/library/history', {
      mediaId: media.id,
      mediaType: media.type,
      title: media.title,
      imageUrl: media.imageUrl,
      positionSeconds: Math.floor(video.currentTime),
      durationSeconds: Math.floor(video.duration),
      watchedSeconds: Math.floor(video.currentTime),
    });
  }, [media]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setPlaying(false);

    if (!media) {
      setTicket(null);
      return;
    }

    setError(null);
    setTicket(null);

    void api
      .post<PlaybackTicket>('/playback/token', {
        mediaId: media.id,
      })
      .then((result) => {
        setTicket(result);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Falha ao preparar a reprodução.',
        );
      });
  }, [media]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ticket) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    video.pause();
    video.removeAttribute('src');

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(video.duration)
        ? video.duration
        : 0;
      setDuration(nextDuration);
      void playSafely();
    };

    if (ticket.mode === 'hls') {
      const nativeHlsSupport = Boolean(
        video.canPlayType('application/vnd.apple.mpegurl'),
      );

      if (nativeHlsSupport) {
        video.src = ticket.url;
        video.addEventListener(
          'loadedmetadata',
          handleLoadedMetadata,
          { once: true },
        );
        video.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });

        hlsRef.current = hls;

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(ticket.url);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const nextDuration = Number.isFinite(video.duration)
            ? video.duration
            : 0;
          setDuration(nextDuration);
          void playSafely();
        });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          const nextDuration = Number.isFinite(video.duration)
            ? video.duration
            : 0;
          setDuration(nextDuration);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError('Não foi possível carregar o stream do servidor.');
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setError('O navegador não conseguiu decodificar este stream.');
          } else {
            setError('O stream foi interrompido por um erro de reprodução.');
          }

          hls.destroy();
          hlsRef.current = null;
        });

        hls.attachMedia(video);
      } else {
        setError('Este navegador não possui suporte para reprodução HLS.');
      }
    } else {
      video.src = ticket.url;
      video.addEventListener(
        'loadedmetadata',
        handleLoadedMetadata,
        { once: true },
      );
      video.load();
    }

    return () => {
      video.removeEventListener(
        'loadedmetadata',
        handleLoadedMetadata,
      );

      hlsRef.current?.destroy();
      hlsRef.current = null;

      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [playSafely, ticket]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || !media) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (video.paused) void playSafely();
        else video.pause();
      }

      if (!isLive && event.key === 'ArrowRight') {
        video.currentTime = Math.min(
          Number.isFinite(video.duration) ? video.duration : video.currentTime + 10,
          video.currentTime + 10,
        );
      }

      if (!isLive && event.key === 'ArrowLeft') {
        video.currentTime = Math.max(0, video.currentTime - 10);
      }

      if (event.key.toLowerCase() === 'm') {
        video.muted = !video.muted;
      }

      if (event.key.toLowerCase() === 'f') {
        void toggleFullscreen();
      }

      if (event.key === 'Escape') {
        if (minimized) setMinimized(false);
        else close();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, isLive, media, minimized, playSafely, setMinimized]);

  useEffect(() => {
    if (!media || media.type === 'live') return;

    const timer = window.setInterval(saveProgress, 15_000);
    return () => window.clearInterval(timer);
  }, [media, saveProgress]);

  if (!media) return null;

  return (
    <div
      ref={playerContainerRef}
      className={
        minimized
          ? 'fixed bottom-5 right-5 z-50 aspect-video w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-black shadow-glow'
          : 'fixed inset-0 z-50 grid place-items-center bg-black/95 p-0 sm:p-6'
      }
    >
      <div className="group relative h-full w-full max-w-7xl overflow-hidden bg-black sm:rounded-2xl">
        <button
          type="button"
          onClick={() => {
            saveProgress();
            close();
          }}
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white hover:text-black"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-5" />
          <span className="hidden sm:inline">Voltar</span>
        </button>

        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          playsInline
          preload="metadata"
          controls={false}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            saveProgress();
          }}
          onEnded={() => {
            setPlaying(false);
            saveProgress();
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
          }}
          onDurationChange={(event) => {
            setDuration(
              Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : 0,
            );
          }}
          onProgress={(event) => {
            const video = event.currentTarget;
            if (!video.buffered.length) return;
            setBuffered(video.buffered.end(video.buffered.length - 1));
          }}
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted);
          }}
          onError={(event) => {
            if (!event.currentTarget.currentSrc) return;

            const mediaError = event.currentTarget.error;
            if (mediaError?.code === 4) {
              setError('O formato deste conteúdo não é suportado pelo navegador.');
            } else {
              setError('Ocorreu um erro ao reproduzir esta mídia.');
            }
          }}
        />

        {!ticket && !error && (
          <div className="absolute inset-0 grid place-items-center text-white/70">
            Preparando stream…
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-8 text-center text-white">
            <div className="max-w-md space-y-4">
              <p>{error}</p>
              <button
                type="button"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
                onClick={() => void playSafely()}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-16 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {canSeek ? (
            <div className="mb-3 space-y-1">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="absolute inset-y-0 left-0 bg-white/30"
                  style={{ width: `${bufferedPercent}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={Math.min(currentTime, duration)}
                  onChange={(event) => {
                    const video = videoRef.current;
                    const value = Number(event.target.value);
                    if (!video || !Number.isFinite(value)) return;
                    video.currentTime = value;
                    setCurrentTime(value);
                  }}
                  aria-label="Avanço do vídeo"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>

              <div className="flex justify-between text-[11px] font-medium text-white/65">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          ) : isLive ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-[11px] font-black tracking-wide">
              <span className="size-2 animate-pulse rounded-full bg-white" />
              AO VIVO
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={playing ? 'Pausar' : 'Reproduzir'}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void playSafely();
                else video.pause();
              }}
            >
              {playing ? (
                <Pause className="size-6 fill-current" />
              ) : (
                <Play className="size-6 fill-current" />
              )}
            </button>

            <button
              type="button"
              aria-label={muted ? 'Ativar som' : 'Silenciar'}
              onClick={() => {
                const video = videoRef.current;
                if (video) video.muted = !video.muted;
              }}
            >
              {muted ? (
                <VolumeX className="size-6" />
              ) : (
                <Volume2 className="size-6" />
              )}
            </button>

            <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold">
              {media.title}
            </p>
          <button
            type="button"
            aria-label={
              isFullscreen
                ? 'Sair da tela cheia'
                : 'Tela cheia'
            }
            title={
              isFullscreen
                ? 'Sair da tela cheia'
                : 'Tela cheia'
            }
            onClick={() => {
              void toggleFullscreen();
            }}
          >
            {isFullscreen ? (
              <Minimize2 className="size-5" />
            ) : (
              <Maximize2 className="size-5" />
            )}
          </button>

            <button
              type="button"
              aria-label="Picture in Picture"
              onClick={() => {
                const video = videoRef.current;
                if (!video?.requestPictureInPicture) {
                  setError('Picture in Picture não está disponível neste navegador.');
                  return;
                }

                void video.requestPictureInPicture().catch(() => {
                  setError('Não foi possível ativar Picture in Picture.');
                });
              }}
            >
              <PictureInPicture className="size-5" />
            </button>

            <button
              type="button"
              aria-label={minimized ? 'Expandir' : 'Minimizar'}
              onClick={() => setMinimized(!minimized)}
            >
              {minimized ? (
                <Maximize className="size-5" />
              ) : (
                <Minimize2 className="size-5" />
              )}
            </button>

            <button
              type="button"
              aria-label="Fechar"
              onClick={() => {
                saveProgress();
                close();
              }}
            >
              <X className="size-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
