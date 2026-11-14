// Edit's typed values on their way to Log for "Use another number" (step
// 179). Held in memory for the one hop, not in the route: the person's words
// stay out of navigation state, and a title with "%20" in it isn't decoded
// twice (code review, step 179).

import { create } from 'zustand';

import type { Category } from '@/types';

export interface RenumberEdits {
  title: string;
  category: Category | null;
  dueIso: string;
}

interface RenumberState {
  handoff: { id: string; edits: RenumberEdits } | null;
  /** Edit hands its values over just before Log opens. */
  hand: (id: string, edits: RenumberEdits) => void;
  /** Log takes them once, and only for the prediction they were handed for. */
  take: (id: string) => RenumberEdits | null;
}

export const useRenumberStore = create<RenumberState>((set, get) => ({
  handoff: null,
  hand: (id, edits) => set({ handoff: { id, edits } }),
  take: (id) => {
    const handoff = get().handoff;
    set({ handoff: null });
    return handoff && handoff.id === id ? handoff.edits : null;
  },
}));
