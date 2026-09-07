// RevenueCat webhook. Keeps `public.entitlements` in step with what people
// actually own, so the server can answer "is this user Plus?" without asking
// the client — which is the only kind of answer a paid inference endpoint can
// trust (see the coach function's Plus gate).
//
// Contract:
//   POST { event: RevenueCatEvent }
//   Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>   // shared secret
//   200 { ok: true, action }   — handled, or deliberately ignored
//   401 { error }              — missing or wrong secret
//   400 { error }              — unparseable body
//   500 { error }              — misconfigured, or the write failed
//
// **This function must be deployed with `--no-verify-jwt`.** RevenueCat has no
// Supabase session and cannot send a user JWT; the shared secret in the
// Authorization header is the entire gate, which is why it is checked before
// anything else and why the function refuses to run without one configured.
//
// Deploy:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<a long random string>
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   # then paste the function URL + the same secret into
//   # RevenueCat -> Project settings -> Integrations -> Webhooks
//
// Everything decided here is decided in ./entitlementFromEvent.ts, which is
// plain TypeScript with no Deno imports so Jest can test it. This file is the
// transport: check the secret, parse, write, answer.

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2';

// The .ts extension is required by Deno for a local import and rejected by the
// project's tsconfig (TS5097), the same shape of conflict as the npm: imports
// above. The module itself is fully typechecked — it is imported without the
// extension by its Jest test.
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { decideFromEvent } from './entitlementFromEvent.ts';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const MAX_BODY_BYTES = 32_000;

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

  const decision = decideFromEvent(body, Date.now());

  // An ignored event is a success. Returning anything else makes RevenueCat
  // retry a delivery that will never do anything, forever.
  if (decision.action === 'ignore' || !decision.userId) {
    console.log('[revenuecat] ignored:', decision.reason);
    return json({ ok: true, action: 'ignored', reason: decision.reason });
  }

  const admin = createClient(
    env.get('SUPABASE_URL')!,
    env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Upsert guarded by the event cursor (migration 004): an event older than
  // the one that last wrote this row is dropped. RevenueCat retries and does
  // not promise ordering, so a late RENEWAL must not resurrect an entitlement
  // that a newer EXPIRATION already ended.
  const { error } = await admin.rpc('apply_entitlement_event', {
    p_user_id: decision.userId,
    p_is_plus: decision.isPlus,
    p_source: decision.source,
    p_expires_at: decision.expiresAt,
    p_event_ms: decision.eventMs,
  });

  if (error) {
    // 500 so RevenueCat retries. A dropped event here is a subscriber who
    // paid and can't use what they bought.
    console.error('[revenuecat] write failed', error);
    return json({ error: 'write_failed' }, 500);
  }

  console.log(
    `[revenuecat] ${decision.reason} for ${decision.userId} (is_plus=${decision.isPlus})`,
  );
  return json({ ok: true, action: 'written', reason: decision.reason });
});
