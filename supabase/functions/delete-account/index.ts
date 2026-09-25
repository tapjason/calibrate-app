// delete-account Edge Function. Deletes the calling user's account and all of
// its server-side data — App Store Review Guideline 5.1.1(v).
// Spec: docs/ACCOUNT_SPEC.md §3.
//
// Contract — kept in lockstep with src/supabase/account.ts:
//   Request:   POST { apple_authorization_code?: string }
//              Authorization: Bearer <user JWT>
//   Response:  200 { ok: true, skipped: string[] }  // account deleted
//              400 { error }                        // malformed body
//              401 { error }                        // no signed-in user
//              429 { error }                        // burst limit
//              500 { error: 'internal' }            // account NOT deleted
//
// A 200 means the auth user is gone. Anything else means it is not, and the
// client leaves the device untouched so the user can retry. There is no
// half-deleted outcome to report.
//
// Order (see ./deletionPlan.ts for why):
//   1. Sign in with Apple token revocation — best effort
//   2. RevenueCat customer deletion        — best effort
//   3. auth.admin.deleteUser               — mandatory, last. Cascades to
//      predictions, coach_usage, entitlements and analytics_events, all of
//      which declare `on delete cascade` (supabase/migrations/).
//
// Deploy:
//   npx supabase functions deploy delete-account
// Optional secrets (each leg is skipped and logged until all of its are set):
//   APPLE_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY, APPLE_CLIENT_ID
//   REVENUECAT_DELETE_KEY (v2, customers write), REVENUECAT_PROJECT_ID
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// by the platform.

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { importPKCS8, SignJWT } from 'npm:jose@5';

// The .ts extension is required by Deno and rejected by the project's
// tsconfig (TS5097), the same conflict as in revenuecat-webhook. The module is
// typechecked through its Jest test.
import type { AppleConfig } from './deletionPlan.ts';
import {
  MAX_BODY_BYTES,
  appleClientSecretClaims,
  classifyRevenueCat,
  parseRequest,
  planDeletion,
  readConfig,
  revenueCatCustomerUrl,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from './deletionPlan.ts';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

// Best-effort per-isolate burst limit, same design as coach. Deletion is
// idempotent, so this only keeps a stuck retry loop from hammering Apple and
// RevenueCat on the user's behalf.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const UPSTREAM_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange the fresh authorization code for a refresh token, then revoke it.
 * Revoking the refresh token ends the app's Sign in with Apple grant, which is
 * what Apple asks for; the code alone can't be revoked.
 */
async function revokeApple(config: AppleConfig, code: string): Promise<void> {
  const key = await importPKCS8(config.privateKey, 'ES256');
  const clientSecret = await new SignJWT(
    appleClientSecretClaims(config, Math.floor(Date.now() / 1000)),
  )
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .sign(key);

  const form = (fields: Record<string, string>) =>
    ({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }) satisfies RequestInit;

  const tokenRes = await fetchWithTimeout(
    'https://appleid.apple.com/auth/token',
    form({
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  );
  if (!tokenRes.ok) throw new Error(`apple token exchange: HTTP ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) throw new Error('apple token exchange: no token in response');

  const revokeRes = await fetchWithTimeout(
    'https://appleid.apple.com/auth/revoke',
    form({
      client_id: config.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }),
  );
  if (!revokeRes.ok) throw new Error(`apple revoke: HTTP ${revokeRes.status}`);
}

// @ts-expect-error — Deno.serve is the Edge Runtime entry point.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // --- Auth: the account being deleted is always the caller's own. ---
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = env.get('SUPABASE_URL');
  const anonKey = env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[delete-account] Supabase env vars not set');
    return json({ error: 'internal' }, 500);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await anon.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  if (rateLimited(user.id)) return json({ error: 'rate_limited' }, 429);

  // --- Body: optional, small, and strictly shaped. ---
  const bodyText = await req.text();
  if (bodyText.length > MAX_BODY_BYTES) return json({ error: 'bad_request' }, 400);
  let raw: unknown = null;
  if (bodyText.trim() !== '') {
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
  }
  const request = parseRequest(raw);
  if (!request) return json({ error: 'bad_request' }, 400);

  const config = readConfig((name: string) => env.get(name));
  const plan = planDeletion(config, request);
  const skipped = [...plan.skipped];

  // --- 1. Apple (best effort). ---
  if (plan.revokeApple && config.apple && request.appleAuthorizationCode) {
    try {
      await revokeApple(config.apple, request.appleAuthorizationCode);
    } catch (e) {
      console.error('[delete-account] apple revocation failed:', e);
      skipped.push('apple: revocation failed');
    }
  }

  // --- 2. RevenueCat (best effort). Does NOT cancel an App Store
  //        subscription; the client warns about that before calling us. ---
  if (plan.deleteRevenueCat && config.revenuecat) {
    try {
      const res = await fetchWithTimeout(
        revenueCatCustomerUrl(config.revenuecat.projectId, user.id),
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.revenuecat.apiKey}` },
        },
      );
      if (classifyRevenueCat(res.status) === 'failed') {
        console.error('[delete-account] revenuecat delete: HTTP', res.status);
        skipped.push('revenuecat: delete failed');
      }
    } catch (e) {
      console.error('[delete-account] revenuecat delete failed:', e);
      skipped.push('revenuecat: delete failed');
    }
  }

  // --- 3. The account itself. Hard delete: the row goes, sessions die, and
  //        every public table's rows cascade with it. ---
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[delete-account] deleteUser failed:', deleteError);
    return json({ error: 'internal' }, 500);
  }

  if (skipped.length > 0) console.log('[delete-account] skipped:', skipped);
  console.log('[delete-account] deleted', user.id);
  return json({ ok: true, skipped });
});
