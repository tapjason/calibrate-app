// Pre-Supabase auth placeholder. Holds a device-local user_id that every
// store call uses as the owner of writes. L5 replaces initialize() with a
// real Supabase session handler; the rest of the app keeps reading
// useAuthStore.getState().userId and doesn't notice the swap.

import { create } from 'zustand';

const LOCAL_USER_ID = 'local-user-v1';

interface AuthState {
  userId: string | null;
  initialize: () => Promise<void>;
  /** Test-only: drop the session. Production callers should not use this. */
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  initialize: async () => {
    set({ userId: LOCAL_USER_ID });
  },
  reset: () => {
    set({ userId: null });
  },
}));
