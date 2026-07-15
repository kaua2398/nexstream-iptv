import { create } from 'zustand';
import type { MediaCardDto } from '@nexstream/shared';

interface PlayerState {
  media: MediaCardDto | null;
  minimized: boolean;
  open: (media: MediaCardDto) => void;
  close: () => void;
  setMinimized: (value: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  media: null,
  minimized: false,
  open: (media) => set({ media, minimized: false }),
  close: () => set({ media: null, minimized: false }),
  setMinimized: (minimized) => set({ minimized }),
}));
