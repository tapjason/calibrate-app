// Supabase client adapter. Single point of access for every other src/supabase/
// module and the authStore. Lazy-initialized so the rest of the app can be
// imported in environments where the SDK shouldn't load (e.g. Jest unit
// tests that mock the client entirely).
//
// Layer rule: L5 (services). Imports React Native's Platform, its sibling
// sessionStorage and the age store (a leaf: zustand, the age band's db helper
// and the engine's predicate) only — never other stores, the engine, or DB
// helpers.
//
// The under-13 rule (roadmap D70): a client made before uploads may start
// (while the phone is local-only, or while Apple's age answer is still pending
// on a launch that asks) is made with the session's auto-refresh off, so
// supabase-js runs neither its refresh timer nor its own start-up refresh of
// an expiring session (`_recoverAndRefresh`). It still renews a stored session
// already expired, or within 90 s of expiry, when the client is made and at
// `getSession()`: any session read does (the residual described on
// `getSupabaseClient` below, pinned in auth.localOnly.test.ts).
// src/supabase/auth.ts pauses and resumes the timer on a client that already
// exists (`pauseSessionRefresh`, `resumeSessionRefresh`), and
// src/age/localOnly.ts resumes it the moment uploads may start.

import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { uploadsMayStart } from '@/store/ageStore';

import { createSessionStorage, supabaseStorageKey, type KeychainDeps } from './sessionStorage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

/**
 * Returns the singleton SupabaseClient. Throws a clear error if the env
 * vars are missing — that's surfaced at the call site rather than at module
 * load so the offline-only build path still imports cleanly.
 *
 * Native modules (AsyncStorage, SecureStore, the URL polyfill) are
 * lazy-required here for the same reason: importing this file from Jest must
 * not crash on a missing native bridge.
 *
 * The session is kept in the iPhone's Keychain (src/supabase/sessionStorage.ts;
 * security review round 5, 2026-11-19), in AsyncStorage on web. The storage
 * key is passed explicitly, the one supabase-js would pick itself, so the
 * storage's launch check reads the same keys the client does.
 *
 * `autoRefreshToken` is on only when uploads may start (`uploadsMayStart`):
 * off under the under-13 rule (D70), and off while Apple's age answer is still
 * pending on a launch that asks, since the client is made at launch (authStore
 * `initialize`) before the answer can come. With it on, auth-js 2.106
 * refreshes an expiring stored session in its own start-up
 * (GoTrueClient `_recoverAndRefresh`) and, outside a browser, starts its
 * refresh timer (`_handleVisibilityChange`); with it off, neither happens, and
 * src/age/localOnly.ts starts the timer once uploads may start
 * (`resumeSessionRefresh`), whose first tick refreshes a session near expiry.
 *
 * What the setting does not stop (the residual the design discloses, checked
 * against the installed library in auth.localOnly.test.ts): any read of a
 * session within 90 s of expiry refreshes it (`__loadSession` calls
 * `_callRefreshToken` whatever the setting). That includes supabase-js's own
 * constructor, which subscribes to `onAuthStateChange` (`_listenForAuthEvents`)
 * and so reads the session for INITIAL_SESSION: a stored session already
 * expired at launch is refreshed as the client is made, before Apple answers
 * and under the rule, and so is one read by authStore's `getSession`. It is
 * also what keeps Sign out and Delete account working for an account frozen
 * by the rule.
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

  const storageKey = supabaseStorageKey(SUPABASE_URL);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: createSessionStorage({
        storageKey,
        asyncStorage: AsyncStorage,
        keychain: loadKeychain(),
      }),
      storageKey,
      autoRefreshToken: uploadsMayStart(),
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
 * The iPhone's Keychain for the session, or null to keep AsyncStorage: on any
 * platform but iOS (web has no Keychain), and on a build made before
 * `expo-secure-store` was added, whose native module is missing (the require
 * throws). Every item is written `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: not in
 * backups, not restored to another phone, readable once the phone has been
 * unlocked after a restart. Never throws.
 */
export function loadKeychain(): KeychainDeps | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    const accessible = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;
    // Without the constant an item would be written with the default,
    // WHEN_UNLOCKED, which goes into backups: AsyncStorage then, as before.
    if (typeof accessible !== 'number') return null;
    return { store: SecureStore, accessible };
  } catch {
    return null;
  }
}

/**
 * The client if it has been made, else null: never makes one. For pausing and
 * resuming the session's refresh (src/supabase/auth.ts), which must not make
 * the client early: a client made later reads the rule itself.
 */
export function peekSupabaseClient(): SupabaseClient | null {
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
