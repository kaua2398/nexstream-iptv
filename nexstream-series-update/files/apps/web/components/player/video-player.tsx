'use client';

import Hls from 'hls.js';
import {
  ArrowLeft,
  Maximize,
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

export function VideoPlayer() {
  const {
    media,
    minimized,
    close,
    setMinimized,
  } = usePlayerStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [ticket, setTicket] =
    useState<PlaybackTicket | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playSafely = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    try {
      await video.play();
      setError(null);
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        caught.name === 'NotAllowedError'
      ) {
        // Autoplay bloqueado pelo navegador.
        // O usuário ainda poderá iniciar pelo botão Play.
        return;
      }

      setError(
        'O navegador não conseguiu iniciar esta mídia.',
      );
    }
  }, []);

  useEffect(() => {
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

    if (!video || !ticket) {
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;

    video.pause();
    video.removeAttribute('src');

    const handleLoadedMetadata = () => {
      void playSafely();
    };

    if (ticket.mode === 'hls') {
      const nativeHlsSupport = Boolean(
        video.canPlayType(
          'application/vnd.apple.mpegurl',
        ),
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
          void playSafely();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setError(
              'Não foi possível carregar o stream do servidor.',
            );
          } else if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR
          ) {
            setError(
              'O navegador não conseguiu decodificar este stream.',
            );
          } else {
            setError(
              'O stream foi interrompido por um erro de reprodução.',
            );
          }

          hls.destroy();
          hlsRef.current = null;
        });

        hls.attachMedia(video);
      } else {
        setError(
          'Este navegador não possui suporte para reprodução HLS.',
        );
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

      if (!video || !media) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();

        if (video.paused) {
          void playSafely();
        } else {
          video.pause();
        }
      }

      if (event.key === 'ArrowRight') {
        video.currentTime += 10;
      }

      if (event.key === 'ArrowLeft') {
        video.currentTime = Math.max(
          0,
          video.currentTime - 10,
        );
      }

      if (event.key.toLowerCase() === 'm') {
        video.muted = !video.muted;
      }

      if (event.key.toLowerCase() === 'f') {
        void video.requestFullscreen().catch(() => {
          setError(
            'Não foi possível ativar a tela cheia.',
          );
        });
      }

      if (event.key === 'Escape') {
        if (minimized) {
          setMinimized(false);
        } else {
          close();
        }
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [
    close,
    media,
    minimized,
    playSafely,
    setMinimized,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (
      !video ||
      !media ||
      media.type === 'live'
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (
        !Number.isFinite(video.duration) ||
        video.currentTime <= 0
      ) {
        return;
      }

      void api.put('/library/history', {
        mediaId: media.id,
        mediaType: media.type,
        title: media.title,
        imageUrl: media.imageUrl,
        positionSeconds: Math.floor(
          video.currentTime,
        ),
        durationSeconds: Math.floor(video.duration),
        watchedSeconds: Math.floor(
          video.currentTime,
        ),
      });
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [media]);

  if (!media) {
    return null;
  }

  const video = videoRef.current;

  return (
    <div
      className={
        minimized
          ? 'fixed bottom-5 right-5 z-50 aspect-video w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-black shadow-glow'
          : 'fixed inset-0 z-50 grid place-items-center bg-black/95 p-0 sm:p-6'
      }
    >
      <div className="group relative h-full w-full max-w-7xl overflow-hidden bg-black sm:rounded-2xl">
        <button
          type="button"
          onClick={close}
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
          onPause={() => setPlaying(false)}
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted);
          }}
          onError={(event) => {
            const mediaError =
              event.currentTarget.error;

            if (mediaError?.code === 4) {
              setError(
                'O formato deste conteúdo não é suportado pelo navegador.',
              );
            } else {
              setError(
                'Ocorreu um erro ao reproduzir esta mídia.',
              );
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

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black via-black/75 to-transparent p-4 pt-12 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button
            type="button"
            aria-label={
              playing ? 'Pausar' : 'Reproduzir'
            }
            onClick={() => {
              if (video?.paused) {
                void playSafely();
              } else {
                video?.pause();
              }
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
            aria-label={
              muted ? 'Ativar som' : 'Silenciar'
            }
            onClick={() => {
              if (video) {
                video.muted = !video.muted;
              }
            }}
          >
            {muted ? (
              <VolumeX className="size-6" />
            ) : (
              <Volume2 className="size-6" />
            )}
          </button>

          <p className="ml-2 min-w-0 flex-1 truncate text-sm font-semibold">
            {media.title}
          </p>

          <button
            type="button"
            aria-label="Picture in Picture"
            onClick={() => {
              if (!video?.requestPictureInPicture) {
                setError(
                  'Picture in Picture não está disponível neste navegador.',
                );
                return;
              }

              void video
                .requestPictureInPicture()
                .catch(() => {
                  setError(
                    'Não foi possível ativar Picture in Picture.',
                  );
                });
            }}
          >
            <PictureInPicture className="size-5" />
          </button>

          <button
            type="button"
            aria-label={
              minimized ? 'Expandir' : 'Minimizar'
            }
            onClick={() => {
              setMinimized(!minimized);
            }}
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
            onClick={close}
          >
            <X className="size-6" />
          </button>
        </div>
      </div>
    </div>
  );
}