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
//   1. Sign in with Apple token revocation — best effort, and only when the
//      code's Apple ID is the one linked to this account
//   2. RevenueCat customer deletion        — best effort, at the same time as 1
//   3. auth.admin.deleteUser               — mandatory, last, after 1 and 2
//      have both settled. Cascades to predictions, coach_usage, entitlements
//      and analytics_events, all of which declare `on delete cascade`
//      (supabase/migrations/).
// Worst case before the delete: the slower of the two legs, each cut off at
// LEG_DEADLINE_MS (20 s); it used to be three 8-second calls in a row.
//
// Deploy:
//   npx supabase functions deploy delete-account
// Optional secrets (each leg is skipped and logged until all of its are set):
//   APPLE_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY, APPLE_CLIENT_ID
//   REVENUECAT_DELETE_KEY (v2, customers write), REVENUECAT_PROJECT_ID
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// by the platform.

// Pinned to the version the app has installed (node_modules, 2026-11-19), as
// coach is, so a deploy never picks up a supabase-js the app hasn't run
// against.
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
// Not pinned yet: no lock file in the repo records the 5.x it resolves to.
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { importPKCS8, SignJWT } from 'npm:jose@5';

// The .ts extension is required by Deno and rejected by the project's
// tsconfig (TS5097), the same conflict as in revenuecat-webhook. The module is
// typechecked through its Jest test.
import type { AppleConfig, AppleTokens, RevenueCatConfig } from './deletionPlan.ts';
import {
  MAX_BODY_BYTES,
  REVENUECAT_SKIPPED,
  appleClientSecretClaims,
  classifyRevenueCat,
  parseRequest,
  planDeletion,
  readConfig,
  revenueCatCustomerUrl,
  runAppleLeg,
  runDeletion,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from './deletionPlan.ts';
import {
  readBodyCapped,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from './readBody.ts';

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

const form = (fields: Record<string, string>) =>
  ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  }) satisfies RequestInit;

/** The Sign in with Apple client secret: an ES256 JWT signed with the .p8 key. */
async function appleClientSecret(config: AppleConfig): Promise<string> {
  const key = await importPKCS8(config.privateKey, 'ES256');
  return await new SignJWT(appleClientSecretClaims(config, Math.floor(Date.now() / 1000)))
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .sign(key);
}

/**
 * The Apple leg's calls. Exchanging the fresh authorization code yields a
 * refresh token and an id_token; revoking the refresh token ends the app's
 * Sign in with Apple grant, which is what Apple asks for (the code alone can't
 * be revoked). Which grant may be revoked is decided in ./deletionPlan.ts
 * (`runAppleLeg`): only the account's own.
 */
function appleLeg(
  config: AppleConfig,
  code: string,
  readIdentities: () => Promise<unknown>,
): () => Promise<string[]> {
  return () => {
    let secret: Promise<string> | null = null;
    const clientSecret = () => (secret ??= appleClientSecret(config));
    return runAppleLeg({
      readIdentities,
      exchangeCode: async (): Promise<AppleTokens> => {
        const res = await fetchWithTimeout(
          'https://appleid.apple.com/auth/token',
          form({
            client_id: config.clientId,
            client_secret: await clientSecret(),
            code,
            grant_type: 'authorization_code',
          }),
        );
        if (!res.ok) throw new Error(`apple token exchange: HTTP ${res.status}`);
        return (await res.json()) as AppleTokens;
      },
      revokeToken: async (token: string, hint: 'refresh_token' | 'access_token') => {
        const res = await fetchWithTimeout(
          'https://appleid.apple.com/auth/revoke',
          form({
            client_id: config.clientId,
            client_secret: await clientSecret(),
            token,
            token_type_hint: hint,
          }),
        );
        if (!res.ok) throw new Error(`apple revoke: HTTP ${res.status}`);
      },
      log: (message: string) => console.warn(message),
    });
  };
}

/**
 * The RevenueCat leg: delete the customer. Does NOT cancel an App Store
 * subscription; the client warns about that before calling us.
 */
function revenueCatLeg(config: RevenueCatConfig, userId: string): () => Promise<string[]> {
  return async () => {
    try {
      const res = await fetchWithTimeout(revenueCatCustomerUrl(config.projectId, userId), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (classifyRevenueCat(res.status) === 'failed') {
        console.error('[delete-account] revenuecat delete: HTTP', res.status);
        return [REVENUECAT_SKIPPED.failed];
      }
      return [];
    } catch (e) {
      console.error('[delete-account] revenuecat delete failed:', e instanceof Error ? e.name : 'error');
      return [REVENUECAT_SKIPPED.failed];
    }
  };
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

  // --- Body: optional, small, and strictly shaped. The declared length
  //     first, then what arrives, so a large body is refused before it is
  //     read and never held whole (security review, round 5). ---
  const body = await readBodyCapped(req.headers.get('Content-Length'), req.body, MAX_BODY_BYTES);
  if (!body.ok) return json({ error: 'bad_request' }, 400);
  const bodyText = body.text;
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId: string = user.id;
  const apple = config.apple;
  const appleCode = request.appleAuthorizationCode;
  const revenuecat = config.revenuecat;

  // --- 1 and 2 at once (best effort), then 3, the account itself: a hard
  //     delete, after both have settled. The row goes, sessions die, and every
  //     public table's rows cascade with it. ---
  const result = await runDeletion({
    apple:
      plan.revokeApple && apple && appleCode
        ? appleLeg(apple, appleCode, async () => {
            // The account's identities, read with the service role: the Apple
            // identity whose grant may be revoked.
            const { data, error } = await admin.auth.admin.getUserById(userId);
            if (error || !data?.user) throw new Error('getUserById failed');
            return data.user.identities;
          })
        : null,
    revenuecat: plan.deleteRevenueCat && revenuecat ? revenueCatLeg(revenuecat, userId) : null,
    deleteUser: async () => {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error('[delete-account] deleteUser failed:', deleteError);
        return false;
      }
      return true;
    },
  });
  if (!result.deleted) return json({ error: 'internal' }, 500);

  const skipped = [...plan.skipped, ...result.skipped];
  if (skipped.length > 0) console.log('[delete-account] skipped:', skipped);
  console.log('[delete-account] deleted', userId);
  return json({ ok: true, skipped });
});
