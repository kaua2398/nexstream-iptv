import { create } from 'zustand';
import type { MediaCardDto } from '@nexstream/shared';

interface PlayerState {
  media: MediaCardDto | null;
  queue: MediaCardDto[];
  currentIndex: number;
  minimized: boolean;

  open: (
    media: MediaCardDto,
    queue?: MediaCardDto[],
  ) => void;

  close: () => void;
  setMinimized: (value: boolean) => void;
  playNext: () => void;
  playPrevious: () => void;
}

function normalizeQueue(
  media: MediaCardDto,
  queue?: MediaCardDto[],
): {
  queue: MediaCardDto[];
  currentIndex: number;
} {
  const unique = new Map<string, MediaCardDto>();

  for (const item of queue ?? []) {
    unique.set(item.id, item);
  }

  unique.set(media.id, media);

  const normalized = [...unique.values()];

  let currentIndex = normalized.findIndex(
    (item) => item.id === media.id,
  );

  if (currentIndex < 0) {
    normalized.push(media);
    currentIndex = normalized.length - 1;
  }

  return {
    queue: normalized,
    currentIndex,
  };
}

export const usePlayerStore =
  create<PlayerState>((set) => ({
    media: null,
    queue: [],
    currentIndex: -1,
    minimized: false,

    open: (media, queue) => {
      const normalized =
        normalizeQueue(media, queue);

      set({
        media,
        queue: normalized.queue,
        currentIndex: normalized.currentIndex,
        minimized: false,
      });
    },

    close: () => {
      set({
        media: null,
        queue: [],
        currentIndex: -1,
        minimized: false,
      });
    },

    setMinimized: (minimized) => {
      set({ minimized });
    },

    playNext: () => {
      set((state) => {
        const nextIndex =
          state.currentIndex + 1;

        const next =
          state.queue[nextIndex];

        if (!next) {
          return state;
        }

        return {
          media: next,
          currentIndex: nextIndex,
          minimized: false,
        };
      });
    },

    playPrevious: () => {
      set((state) => {
        const previousIndex =
          state.currentIndex - 1;

        const previous =
          state.queue[previousIndex];

        if (!previous) {
          return state;
        }

        return {
          media: previous,
          currentIndex: previousIndex,
          minimized: false,
        };
      });
    },
  }));