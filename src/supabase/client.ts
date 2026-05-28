// Supabase client adapter. Single point of access for every other src/supabase/
// module and the authStore. Lazy-initialized so the rest of the app can be
// imported in environments where the SDK shouldn't load (e.g. Jest unit
// tests that mock the client entirely).
//
// Layer rule: L5 (services). Imports from @/types only — never reaches into
// stores, the engine, or DB helpers.

import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

/**
 * Returns the singleton SupabaseClient. Throws a clear error if the env
 * vars are missing — that's surfaced at the call site rather than at module
 * load so the offline-only build path still imports cleanly.
 *
 * Native modules (AsyncStorage, the URL polyfill) are lazy-required here
 * for the same reason: importing this file from Jest must not crash on a
 * missing native bridge.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase credentials missing. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local (copy from .env.example).',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('react-native-url-polyfill/auto');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage')
    .default as typeof import('@react-native-async-storage/async-storage').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // PKCE flow is required for native OAuth — the implicit flow's URL
      // fragment doesn't survive the redirect back into the app.
      flowType: 'pkce',
      detectSessionInUrl: false,
    },
  });
  return client;
}

/**
 * Returns true when the client can be used. authStore uses this to decide
 * whether to enable Supabase wiring or run in pure-guest mode (the offline
 * core loop must still work when Supabase isn't configured).
 *
 * Returns true when either:
 *   - the env vars are set (production)
 *   - a test client has been injected via setSupabaseClientForTests
 */
export function isSupabaseConfigured(): boolean {
  if (client !== null) return true;
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Test-only: inject a mock SupabaseClient (or null to reset). */
export function setSupabaseClientForTests(next: SupabaseClient | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setSupabaseClientForTests is only allowed when NODE_ENV=test');
  }
  client = next;
}
