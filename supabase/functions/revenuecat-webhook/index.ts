// RevenueCat webhook. Keeps `public.entitlements` in step with what people
// actually own, so the server can answer "is this user Plus?" without asking
// the client — which is the only kind of answer a paid inference endpoint can
// trust (see the coach function's Plus gate).
//
// Contract:
//   POST { event: RevenueCatEvent }
//   Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>   // shared secret
//   200 { ok: true, action }   — handled, or deliberately ignored (exactly
//                                200: RevenueCat counts anything else as failed)
//   401 { error }              — missing or wrong secret
//   400 { error }              — unparseable body
//   413 { error }              — body over 32 KB
//   500 { error }              — misconfigured, a RevenueCat lookup failed, or
//                                the write failed (RevenueCat retries)
//
// **This function must be deployed with `--no-verify-jwt`.** RevenueCat has no
// Supabase session and cannot send a user JWT; the shared secret in the
// Authorization header is the entire gate, which is why it is checked before
// anything else and why the function refuses to run without one configured.
//
// Deploy:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<a long random string>
//   supabase secrets set REVENUECAT_READ_KEY=sk_...   # step 189, below
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   # then paste the function URL + the same secret into
//   # RevenueCat -> Project settings -> Integrations -> Webhooks
//
// Lookups: a TRANSFER (step 189), a CANCELLATION, a REFUND_REVERSED and a few
// others (security review, 2026-11-18; ./entitlementFromEvent.ts says which and
// why) are decided by asking RevenueCat what each Supabase user owns now
// (../_shared/revenuecatLookup.ts) and writing that. That needs
// REVENUECAT_READ_KEY (a v2 secret key with customer_information:customers:read
// and project_configuration:entitlements:read, nothing else) and
// REVENUECAT_PROJECT_ID. Without them those events answer 500, so RevenueCat
// retries and its dashboard shows the failure; a refund is written as free
// first.
//
// Everything decided here is decided in ./entitlementFromEvent.ts and run by
// ./handleEvent.ts, plain TypeScript with no Deno imports so Jest can test
// them. This file is the transport: check the secret, cap and parse the body,
// hand over the real lookup and the real write, answer.

// Pinned to the version the app has installed (node_modules, 2026-11-19), as
// coach is, so a deploy never picks up a supabase-js the app hasn't run
// against.
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';

// The .ts extension is required by Deno for a local import and rejected by the
// project's tsconfig (TS5097), the same shape of conflict as the npm: imports
// above. The module itself is fully typechecked — it is imported without the
// extension by its Jest test.
import type { WriteOutcome } from './handleEvent.ts';
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { handleWebhookEvent } from './handleEvent.ts';
import type { EntitlementWrite } from '../_shared/revenuecatLookup.ts';
import {
  createLookupCache,
  isForeignKeyViolation,
  lookupPlus,
  readLookupConfig,
  toRpcArgs,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from '../_shared/revenuecatLookup.ts';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const MAX_BODY_BYTES = 32_000;

/**
 * The project's entitlements list (the plus entitlement's RevenueCat id, and
 * proof the key and project id work), read once per isolate.
 */
const lookupCache = createLookupCache();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Length-independent comparison. A webhook secret is a bearer credential, and
 * an early-exit compare leaks its prefix to anyone willing to time requests.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// @ts-expect-error — Deno global.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expected = env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  if (!expected) {
    // Fail closed. With no secret configured this endpoint would be an open
    // write path to entitlements — i.e. a way for anyone to grant themselves
    // Plus.
    console.error('REVENUECAT_WEBHOOK_SECRET is not set; refusing every call');
    return json({ error: 'not_configured' }, 500);
  }

  const provided = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!secretMatches(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const bodyText = await req.text();
  if (bodyText.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const supabaseUrl = env.get('SUPABASE_URL');
  const serviceRoleKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[revenuecat] Supabase env vars not set');
    return json({ error: 'not_configured' }, 500);
  }
  // Made on first use: an ignored event never needs it.
  let admin: ReturnType<typeof createClient> | null = null;
  const lookupConfig = readLookupConfig((name: string) => env.get(name));

  const reply = await handleWebhookEvent(body, {
    now: Date.now,
    options: { ignoreSandbox: env.get('REVENUECAT_IGNORE_SANDBOX') === 'true' },
    lookup: (userId: string) =>
      lookupPlus(userId, lookupConfig, {
        fetch,
        now: Date.now,
        cache: lookupCache,
        log: (message: string) => console.error(message),
      }),
    // Upsert guarded by the event cursor (migration 004): an event older than
    // the one that last wrote this row is dropped. RevenueCat retries and does
    // not promise ordering, so a late RENEWAL must not resurrect an entitlement
    // that a newer EXPIRATION already ended.
    write: async (write: EntitlementWrite): Promise<WriteOutcome> => {
      admin ??= createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await admin.rpc('apply_entitlement_event', toRpcArgs(write));
      // The user is not in auth.users: a deleted account. (Migration 004's
      // function catches this itself; this covers a live function that doesn't.)
      if (error && isForeignKeyViolation(error)) return 'no_user';
      if (error) {
        console.error('[revenuecat] apply_entitlement_event failed', error);
        return 'failed';
      }
      return 'written';
    },
    log: (message: string) => console.log(message),
  });

  return json(reply.body, reply.status);
});
