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
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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

interface HistoryItem {
  mediaId: string;
  mediaType: 'live' | 'movie' | 'episode';
  title: string;
  imageUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed?: boolean;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '00:00';
  }

  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(
    (total % 3600) / 60,
  );
  const seconds = total % 60;

  if (hours > 0) {
    return [
      String(hours),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ].join(':');
  }

  return [
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

function mediaErrorMessage(
  error: MediaError | null,
): string {
  if (!error) {
    return 'Não foi possível reproduzir este conteúdo.';
  }

  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'A reprodução foi interrompida.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'A conexão com o servidor de vídeo foi interrompida.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'O navegador não conseguiu decodificar o vídeo. O conteúdo pode estar em HEVC/H.265 ou outro codec não suportado.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'O servidor de vídeo interrompeu a resposta ou enviou um formato não suportado. Tentaremos reconectar automaticamente.';
    default:
      return 'Não foi possível reproduzir este conteúdo.';
  }
}

export function VideoPlayer() {
  const {
    media,
    queue,
    currentIndex,
    minimized,
    close,
    setMinimized,
    playNext,
    playPrevious,
  } = usePlayerStore();

  const hasPreviousEpisode =
    media?.type === 'episode' &&
    currentIndex > 0;

  const hasNextEpisode =
    media?.type === 'episode' &&
    currentIndex >= 0 &&
    currentIndex < queue.length - 1;

  const queryClient = useQueryClient();

  const containerRef =
    useRef<HTMLDivElement>(null);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const hlsRef =
    useRef<Hls | null>(null);

  const lastSavedPositionRef =
    useRef(0);

  const desiredStartRef =
    useRef(0);

  const stallTimerRef =
    useRef<number | null>(null);

  const automaticRetryCountRef =
    useRef(0);

  const hlsNetworkRetryRef =
    useRef(0);

  const hlsMediaRetryRef =
    useRef(0);

  const [ticket, setTicket] =
    useState<PlaybackTicket | null>(null);

  const [sourceRevision, setSourceRevision] =
    useState(0);

  const [resumeCandidate, setResumeCandidate] =
    useState<HistoryItem | null>(null);

  const [historyChecked, setHistoryChecked] =
    useState(false);

  const [shouldLoad, setShouldLoad] =
    useState(false);

  const [playing, setPlaying] =
    useState(false);

  const [buffering, setBuffering] =
    useState(false);

  const [needsUserPlay, setNeedsUserPlay] =
    useState(false);

  const [muted, setMuted] =
    useState(false);

  const [currentSeconds, setCurrentSeconds] =
    useState(0);

  const [durationSeconds, setDurationSeconds] =
    useState(0);

  const [error, setError] =
    useState<string | null>(null);

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [fillScreen, setFillScreen] =
    useState(true);

  const isLive = media?.type === 'live';

  const clearStallTimer =
    useCallback(() => {
      if (stallTimerRef.current != null) {
        window.clearTimeout(
          stallTimerRef.current,
        );

        stallTimerRef.current = null;
      }
    }, []);
  const playSafely = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    try {
      await video.play();

      setNeedsUserPlay(false);
      setBuffering(false);
      setError(null);
    } catch (caught) {
      /*
       * AbortError acontece quando uma chamada play() ainda está
       * pendente e o player troca a fonte, pausa ou muda de episódio.
       * É uma condição normal de corrida do navegador e não deve
       * aparecer como falha de reprodução.
       */
      if (
        caught instanceof DOMException &&
        caught.name === 'AbortError'
      ) {
        return;
      }

      if (
        caught instanceof DOMException &&
        caught.name === 'NotAllowedError'
      ) {
        setNeedsUserPlay(true);
        setBuffering(false);
        return;
      }

      setNeedsUserPlay(false);
      setBuffering(false);

      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível iniciar a reprodução.',
      );
    }
  }, []);

  const saveProgress = useCallback(
    async (
      force = false,
      refreshHistory = false,
    ): Promise<void> => {
      const video = videoRef.current;

      if (
        !video ||
        !media ||
        (
          media.type !== 'movie' &&
          media.type !== 'episode'
        )
      ) {
        return;
      }

      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !Number.isFinite(video.currentTime) ||
        video.currentTime <= 0
      ) {
        return;
      }

      const duration = Math.min(
        864_000,
        Math.max(
          0,
          Math.floor(video.duration),
        ),
      );

      const position = Math.min(
        duration,
        Math.max(
          0,
          Math.floor(video.currentTime),
        ),
      );

      if (
        !force &&
        Math.abs(
          position -
            lastSavedPositionRef.current,
        ) < 10
      ) {
        return;
      }

      try {
        await api.put<{ item: HistoryItem }>(
          '/library/history',
          {
            mediaId: media.id,
            mediaType: media.type,
            title: media.title,
            imageUrl: media.imageUrl,
            positionSeconds: position,
            durationSeconds: duration,
            watchedSeconds: position,
          },
        );

        lastSavedPositionRef.current =
          position;

        if (refreshHistory) {
          void queryClient.invalidateQueries({
            queryKey: ['history'],
          });
        }
      } catch {
        /*
         * O histórico não deve interromper o player.
         */
      }
    },
    [media, queryClient],
  );

  const closePlayer = useCallback(async () => {
    await saveProgress(true, true);

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch {
      // O PiP pode já estar fechado.
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // A tela cheia pode já estar fechada.
    }

    close();
  }, [close, saveProgress]);

  const toggleFullscreen =
    useCallback(async () => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await container.requestFullscreen();
        }
      } catch {
        setError(
          'Não foi possível ativar a tela cheia.',
        );
      }
    }, []);

  const togglePictureInPicture =
    useCallback(async () => {
      const video = videoRef.current;

      if (!video?.requestPictureInPicture) {
        setError(
          'Picture in Picture não está disponível neste navegador.',
        );
        return;
      }

      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch {
        setError(
          'Não foi possível abrir a mini tela.',
        );
      }
    }, []);

  const retryPlayback = useCallback(
    (manual = true) => {
      const video = videoRef.current;

      clearStallTimer();

      if (manual) {
        automaticRetryCountRef.current = 0;
      }

      desiredStartRef.current =
        isLive ||
        !video ||
        !Number.isFinite(video.currentTime)
          ? 0
          : Math.max(0, video.currentTime);

      hlsRef.current?.destroy();
      hlsRef.current = null;

      setError(null);
      setBuffering(true);
      setNeedsUserPlay(false);

      /*
       * Reutiliza o mesmo playback token. Assim a recuperação
       * não grava outro token no banco nem espera uma nova
       * chamada de autenticação.
       */
      if (ticket) {
        setSourceRevision(Date.now());
      } else {
        setShouldLoad(true);
      }
    },
    [
      clearStallTimer,
      isLive,
      ticket,
    ],
  );

  const scheduleStallRecovery =
    useCallback(() => {
      if (
        stallTimerRef.current != null ||
        error
      ) {
        return;
      }

      setBuffering(true);

      stallTimerRef.current =
        window.setTimeout(() => {
          stallTimerRef.current = null;

          const video = videoRef.current;

          if (
            !video ||
            video.paused ||
            video.ended
          ) {
            setBuffering(false);
            return;
          }

          if (
            automaticRetryCountRef.current >= 6
          ) {
            setBuffering(false);

            setError(
              'O servidor IPTV permaneceu indisponível após várias tentativas. Pressione Tentar novamente para continuar do mesmo ponto.',
            );

            return;
          }

          automaticRetryCountRef.current += 1;
          retryPlayback(false);
        }, 2_500);
    }, [
      error,
      retryPlayback,
    ]);

  const goToNextEpisode =
    useCallback(async () => {
      if (!hasNextEpisode) {
        return;
      }

      await saveProgress(
        true,
        true,
      );

      playNext();
    }, [
      hasNextEpisode,
      playNext,
      saveProgress,
    ]);

  const goToPreviousEpisode =
    useCallback(async () => {
      const video = videoRef.current;

      /*
       * Igual aos players conhecidos:
       * após 5 segundos, o botão reinicia o episódio atual.
       */
      if (
        video &&
        Number.isFinite(video.currentTime) &&
        video.currentTime > 5
      ) {
        video.currentTime = 0;
        setCurrentSeconds(0);
        return;
      }

      if (!hasPreviousEpisode) {
        return;
      }

      await saveProgress(
        true,
        true,
      );

      playPrevious();
    }, [
      hasPreviousEpisode,
      playPrevious,
      saveProgress,
    ]);
  /*
   * Bloqueia a rolagem da página enquanto o player
   * estiver aberto em tamanho normal.
   */
  useEffect(() => {
    if (!media || minimized) {
      return;
    }

    const previousHtmlOverflow =
      document.documentElement.style.overflow;

    const previousBodyOverflow =
      document.body.style.overflow;

    document.documentElement.style.overflow =
      'hidden';

    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow =
        previousHtmlOverflow;

      document.body.style.overflow =
        previousBodyOverflow;
    };
  }, [media, minimized]);

  /*
   * Verifica o histórico antes de carregar o stream.
   */
  useEffect(() => {
    setTicket(null);
    setResumeCandidate(null);
    setHistoryChecked(false);
    setShouldLoad(false);
    setPlaying(false);
    setBuffering(false);
    setNeedsUserPlay(false);
    setCurrentSeconds(0);
    setDurationSeconds(0);
    setError(null);

    clearStallTimer();

    desiredStartRef.current = 0;
    lastSavedPositionRef.current = 0;
    automaticRetryCountRef.current = 0;
    hlsNetworkRetryRef.current = 0;
    hlsMediaRetryRef.current = 0;
    setSourceRevision(0);

    if (!media) {
      return;
    }

    if (
      media.type !== 'movie' &&
      media.type !== 'episode'
    ) {
      setHistoryChecked(true);
      setShouldLoad(true);
      return;
    }

    let cancelled = false;

    void api
      .get<{ items: HistoryItem[] }>(
        '/library/history',
      )
      .then(({ items }) => {
        if (cancelled) {
          return;
        }

        const saved = items.find(
          (item) => item.mediaId === media.id,
        );

        const canResume =
          saved != null &&
          !saved.completed &&
          saved.positionSeconds >= 10 &&
          saved.durationSeconds > 0 &&
          saved.positionSeconds <
            saved.durationSeconds - 10;

        if (canResume) {
          setResumeCandidate(saved);
        } else {
          setShouldLoad(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setShouldLoad(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearStallTimer, media]);

  /*
   * Emite o token de reprodução.
   */
  useEffect(() => {
    if (!media || !shouldLoad) {
      return;
    }

    let cancelled = false;

    setBuffering(true);
    setTicket(null);
    setError(null);

    void api
      .post<PlaybackTicket>('/playback/token', {
        mediaId: media.id,
      })
      .then((result) => {
        if (!cancelled) {
          setTicket(result);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setBuffering(false);

          setError(
            caught instanceof Error
              ? caught.message
              : 'Falha ao preparar a reprodução.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    media,
    shouldLoad,
  ]);

  /*
   * Anexa o arquivo ou playlist HLS ao elemento de vídeo.
   * Não existe watchdog nem reconexão infinita.
   */
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !ticket || !media) {
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;

    const sourceUrl =
      `${ticket.url}${
        ticket.url.includes('?')
          ? '&'
          : '?'
      }reload=${sourceRevision}`;

    video.pause();
    video.removeAttribute('src');
    video.load();

    const loadTimeout =
      window.setTimeout(() => {
        setBuffering(false);

        setError(
          'O servidor demorou demais para carregar o vídeo. Pressione Tentar novamente.',
        );
      }, 15_000);

    const clearLoadTimeout = () => {
      window.clearTimeout(loadTimeout);
    };
    const seekAndPlay = () => {
      const startAt =
        desiredStartRef.current;

      if (
        startAt > 0 &&
        Number.isFinite(video.duration) &&
        startAt < video.duration - 2
      ) {
        video.currentTime = startAt;
        setCurrentSeconds(startAt);
      }

      setDurationSeconds(
        Number.isFinite(video.duration)
          ? video.duration
          : 0,
      );

      setBuffering(false);
      void playSafely();
    };

    const handleLoadedMetadata = () => {
      clearLoadTimeout();
      seekAndPlay();
    };

    video.addEventListener(
      'loadedmetadata',
      handleLoadedMetadata,
      { once: true },
    );

    if (ticket.mode === 'hls') {
      const nativeHls = Boolean(
        video.canPlayType(
          'application/vnd.apple.mpegurl',
        ),
      );

      if (nativeHls) {
        video.src = sourceUrl;
        video.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,

          /*
           * Em TV ao vivo, prioriza estabilidade em vez
           * de ficar colado no limite mais recente.
           */
          lowLatencyMode: false,
          startFragPrefetch: true,
          backBufferLength: 60,
          maxBufferLength:
            isLive ? 45 : 90,
          maxMaxBufferLength:
            isLive ? 120 : 180,
          maxBufferHole: 0.5,
          liveSyncDurationCount:
            isLive ? 6 : 3,
          liveMaxLatencyDurationCount:
            isLive ? 15 : 8,
          manifestLoadingMaxRetry: 6,
          manifestLoadingRetryDelay: 500,
          manifestLoadingMaxRetryTimeout:
            6_000,
          levelLoadingMaxRetry: 6,
          levelLoadingRetryDelay: 500,
          levelLoadingMaxRetryTimeout:
            6_000,
          fragLoadingMaxRetry: 8,
          fragLoadingRetryDelay: 500,
          fragLoadingMaxRetryTimeout:
            8_000,
        });

        hlsRef.current = hls;

        hls.on(
          Hls.Events.MEDIA_ATTACHED,
          () => {
            hls.loadSource(sourceUrl);
          },
        );

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            clearLoadTimeout();
            setBuffering(false);
            void playSafely();
          },
        );

        hls.on(
          Hls.Events.ERROR,
          (_event, data) => {
            if (!data.fatal) {
              if (
                data.details ===
                Hls.ErrorDetails.BUFFER_STALLED_ERROR
              ) {
                scheduleStallRecovery();
              }

              return;
            }

            if (
              data.type ===
              Hls.ErrorTypes.NETWORK_ERROR
            ) {
              if (
                hlsNetworkRetryRef.current < 3
              ) {
                hlsNetworkRetryRef.current += 1;
                setBuffering(true);
                hls.startLoad();
                return;
              }

              retryPlayback(false);
              return;
            }

            if (
              data.type ===
              Hls.ErrorTypes.MEDIA_ERROR
            ) {
              if (
                hlsMediaRetryRef.current < 2
              ) {
                hlsMediaRetryRef.current += 1;
                setBuffering(true);
                hls.recoverMediaError();
                return;
              }

              retryPlayback(false);
              return;
            }

            setBuffering(false);
            setError(
              'O stream foi interrompido. Pressione Tentar novamente.',
            );

            hls.destroy();
            hlsRef.current = null;
          },
        );

        hls.attachMedia(video);
      } else {
        setBuffering(false);

        setError(
          'Este navegador não possui suporte a HLS.',
        );
      }
    } else {
      video.src = sourceUrl;
      video.load();
    }

    return () => {
      clearLoadTimeout();

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
  }, [
    isLive,
    media,
    playSafely,
    retryPlayback,
    scheduleStallRecovery,
    sourceRevision,
    ticket,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement ===
          containerRef.current,
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

  useEffect(() => {
    if (
      !media ||
      (
        media.type !== 'movie' &&
        media.type !== 'episode'
      )
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void saveProgress(false, false);
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [media, saveProgress]);

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
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

      if (
        event.key === 'ArrowRight' &&
        !isLive
      ) {
        video.currentTime = Math.min(
          video.duration ||
            Number.MAX_SAFE_INTEGER,
          video.currentTime + 10,
        );
      }

      if (
        event.key === 'ArrowLeft' &&
        !isLive
      ) {
        video.currentTime = Math.max(
          0,
          video.currentTime - 10,
        );
      }

      if (
        event.key.toLowerCase() === 'n' &&
        hasNextEpisode
      ) {
        void goToNextEpisode();
      }

      if (
        event.key.toLowerCase() === 'p' &&
        (
          hasPreviousEpisode ||
          video.currentTime > 5
        )
      ) {
        void goToPreviousEpisode();
      }
      if (event.key.toLowerCase() === 'm') {
        video.muted = !video.muted;
      }

      if (event.key.toLowerCase() === 'f') {
        void toggleFullscreen();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [
    goToNextEpisode,
    goToPreviousEpisode,
    hasNextEpisode,
    hasPreviousEpisode,
    isLive,
    media,
    playSafely,
    toggleFullscreen,
  ]);

  useEffect(() => {
    return () => {
      clearStallTimer();
    };
  }, [clearStallTimer]);
  if (!media) {
    return null;
  }

  const showCenterPlay =
    ticket != null &&
    !playing &&
    !buffering &&
    !error &&
    resumeCandidate == null;

  return (
    <div
      ref={containerRef}
      className={
        minimized
          ? 'fixed bottom-5 right-5 z-50 aspect-video w-[min(460px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl'
          : 'fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-black'
      }
    >
      <div
        className="group relative h-full w-full overflow-hidden bg-black"
        onDoubleClick={() => {
          void toggleFullscreen();
        }}
      >
        <video
          ref={videoRef}
          poster={media.imageUrl ?? undefined}
          className={`h-full w-full ${
            fillScreen
              ? 'object-cover'
              : 'object-contain'
          }`}
          autoPlay
          playsInline
          preload="auto"
          controls={false}
          onClick={() => {
            const video = videoRef.current;

            if (!video) {
              return;
            }

            if (video.paused) {
              void playSafely();
            } else {
              video.pause();
            }
          }}
          onPlay={() => {
            setPlaying(true);
            setNeedsUserPlay(false);
          }}
          onPlaying={() => {
            clearStallTimer();

            automaticRetryCountRef.current = 0;
            hlsNetworkRetryRef.current = 0;
            hlsMediaRetryRef.current = 0;

            setPlaying(true);
            setBuffering(false);
            setNeedsUserPlay(false);
            setError(null);
          }}
          onPause={() => {
            setPlaying(false);
            void saveProgress(false, false);
          }}
          onWaiting={() => {
            if (playing) {
              scheduleStallRecovery();
            }
          }}
          onStalled={() => {
            if (playing) {
              scheduleStallRecovery();
            }
          }}
          onCanPlay={() => {
            clearStallTimer();
            setBuffering(false);
          }}
          onEnded={() => {
            setPlaying(false);

            void (async () => {
              await saveProgress(
                true,
                true,
              );

              if (hasNextEpisode) {
                playNext();
              }
            })();
          }}
          onTimeUpdate={(event) => {
            setCurrentSeconds(
              event.currentTarget.currentTime,
            );
          }}
          onDurationChange={(event) => {
            const value =
              event.currentTarget.duration;

            setDurationSeconds(
              Number.isFinite(value)
                ? value
                : 0,
            );
          }}
          onVolumeChange={(event) => {
            setMuted(
              event.currentTarget.muted,
            );
          }}
          onError={(event) => {
            clearStallTimer();

            if (
              ticket?.mode === 'hls' &&
              hlsRef.current
            ) {
              return;
            }

            setBuffering(false);
            setPlaying(false);

            setError(
              mediaErrorMessage(
                event.currentTarget.error,
              ),
            );
          }}
        />

        {!minimized && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent p-5 pb-16 text-white">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2 text-sm font-semibold backdrop-blur"
              onClick={() => {
                void closePlayer();
              }}
            >
              <ArrowLeft className="size-5" />
              Voltar
            </button>

            <button
              type="button"
              className="rounded-lg bg-black/40 px-3 py-2 text-xs font-semibold backdrop-blur"
              onClick={() => {
                setFillScreen(
                  (current) => !current,
                );
              }}
            >
              {fillScreen
                ? 'Mostrar vídeo inteiro'
                : 'Preencher a tela'}
            </button>
          </div>
        )}

        {!historyChecked && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 text-white">
            Verificando histórico…
          </div>
        )}

        {resumeCandidate && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/85 p-6 text-white backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
              <p className="text-sm text-white/60">
                Você já começou este conteúdo
              </p>

              <h2 className="mt-2 text-xl font-bold">
                {media.title}
              </h2>

              <p className="mt-3 text-white/75">
                Parou em{' '}
                <strong>
                  {formatTime(
                    resumeCandidate.positionSeconds,
                  )}
                </strong>
                .
              </p>

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  className="rounded-xl bg-white px-4 py-3 font-semibold text-black"
                  onClick={() => {
                    desiredStartRef.current =
                      resumeCandidate.positionSeconds;

                    setResumeCandidate(null);
                    setShouldLoad(true);
                  }}
                >
                  Continuar de{' '}
                  {formatTime(
                    resumeCandidate.positionSeconds,
                  )}
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-white/20 px-4 py-3 font-semibold"
                  onClick={() => {
                    desiredStartRef.current = 0;

                    setResumeCandidate(null);
                    setShouldLoad(true);
                  }}
                >
                  Começar do início
                </button>

                <button
                  type="button"
                  className="px-4 py-2 text-sm text-white/60"
                  onClick={() => {
                    void closePlayer();
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {buffering && !resumeCandidate && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/20 text-white">
            <div className="flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold backdrop-blur">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {playing
                ? 'Recuperando conexão…'
                : 'Carregando vídeo…'}
            </div>
          </div>
        )}

        {showCenterPlay && (
          <button
            type="button"
            aria-label="Reproduzir"
            className="absolute left-1/2 top-1/2 z-30 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white shadow-2xl backdrop-blur transition hover:scale-105"
            onClick={() => {
              void playSafely();
            }}
          >
            <Play className="ml-1 size-10 fill-current" />
          </button>
        )}

        {needsUserPlay && !error && (
          <p className="pointer-events-none absolute left-1/2 top-[calc(50%+3.5rem)] z-30 -translate-x-1/2 text-sm text-white/80">
            Clique para reproduzir
          </p>
        )}

        {error && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/90 p-8 text-center text-white">
            <div className="max-w-lg space-y-5">
              <p className="text-lg font-semibold">
                {error}
              </p>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-black"
                onClick={() => {
                  retryPlayback(true);
                }}
              >
                <RotateCcw className="size-5" />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/85 to-transparent p-4 pt-16 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {!isLive && (
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={Math.max(
                  1,
                  durationSeconds,
                )}
                step={1}
                value={Math.min(
                  currentSeconds,
                  Math.max(
                    1,
                    durationSeconds,
                  ),
                )}
                aria-label="Avanço do vídeo"
                className="h-1.5 w-full cursor-pointer accent-red-600"
                onChange={(event) => {
                  const video = videoRef.current;
                  const next =
                    Number(event.target.value);

                  if (video) {
                    video.currentTime = next;
                  }

                  setCurrentSeconds(next);
                }}
              />

              <div className="mt-1 flex justify-between text-[11px] text-white/65">
                <span>
                  {formatTime(currentSeconds)}
                </span>

                <span>
                  {formatTime(durationSeconds)}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {media.type === 'episode' && (
              <button
                type="button"
                aria-label="Episódio anterior"
                title={
                  currentSeconds > 5
                    ? 'Reiniciar episódio'
                    : 'Episódio anterior'
                }
                disabled={
                  !hasPreviousEpisode &&
                  currentSeconds <= 5
                }
                className="disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() => {
                  void goToPreviousEpisode();
                }}
              >
                <SkipBack className="size-6 fill-current" />
              </button>
            )}

            <button
              type="button"
              aria-label={
                playing
                  ? 'Pausar'
                  : 'Reproduzir'
              }
              onClick={() => {
                const video = videoRef.current;

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

            {media.type === 'episode' && (
              <button
                type="button"
                aria-label="Próximo episódio"
                title="Próximo episódio"
                disabled={!hasNextEpisode}
                className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={() => {
                  void goToNextEpisode();
                }}
              >
                <SkipForward className="size-6 fill-current" />
                <span className="hidden text-xs font-semibold xl:inline">
                  Próximo episódio
                </span>
              </button>
            )}

            <button
              type="button"
              aria-label={
                muted
                  ? 'Ativar som'
                  : 'Silenciar'
              }
              onClick={() => {
                const video = videoRef.current;

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

            {isLive && (
              <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold">
                AO VIVO
              </span>
            )}

            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {media.title}
            </p>

            <button
              type="button"
              className="hidden text-xs font-semibold sm:block"
              onClick={() => {
                setFillScreen(
                  (current) => !current,
                );
              }}
            >
              {fillScreen
                ? 'Ajustar'
                : 'Preencher'}
            </button>

            <button
              type="button"
              aria-label="Picture in Picture"
              onClick={() => {
                void togglePictureInPicture();
              }}
            >
              <PictureInPicture className="size-5" />
            </button>

            <button
              type="button"
              aria-label={
                minimized
                  ? 'Expandir player'
                  : 'Minimizar player'
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
              aria-label={
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
              aria-label="Fechar"
              onClick={() => {
                void closePlayer();
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