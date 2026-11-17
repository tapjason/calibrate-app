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
// TRANSFER (step 189): the event names users but carries no entitlement, so
// each Supabase user it names is looked up in RevenueCat
// (../_shared/revenuecatLookup.ts) and written as RevenueCat says. That needs
// REVENUECAT_READ_KEY (a v2 secret key with customer_information:customers:read
// and project_configuration:entitlements:read, nothing else) and
// REVENUECAT_PROJECT_ID. Without them a TRANSFER answers 500, so RevenueCat
// retries and its dashboard shows the failure.
//
// Everything decided here is decided in ./entitlementFromEvent.ts, which is
// plain TypeScript with no Deno imports so Jest can test it. This file is the
// transport: check the secret, parse, look up when told to, write, answer.

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2';

// The .ts extension is required by Deno for a local import and rejected by the
// project's tsconfig (TS5097), the same shape of conflict as the npm: imports
// above. The module itself is fully typechecked — it is imported without the
// extension by its Jest test.
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { decideFromEvent } from './entitlementFromEvent.ts';
import type { EntitlementWrite } from '../_shared/revenuecatLookup.ts';
import {
  createLookupCache,
  isForeignKeyViolation,
  lookupPlus,
  readLookupConfig,
  toRpcArgs,
  writeFromLookup,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from '../_shared/revenuecatLookup.ts';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const MAX_BODY_BYTES = 32_000;

/** The plus entitlement's RevenueCat id, read once per isolate. */
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

  const decision = decideFromEvent(body, Date.now(), {
    ignoreSandbox: env.get('REVENUECAT_IGNORE_SANDBOX') === 'true',
  });

  // An ignored event is a success. Returning anything else makes RevenueCat
  // retry a delivery that will never do anything, forever.
  if (decision.action === 'ignore') {
    console.log('[revenuecat] ignored:', decision.reason);
    return json({ ok: true, action: 'ignored', reason: decision.reason });
  }

  // The writes to make: one straight from the event, or, for a TRANSFER, one
  // per user named, each as RevenueCat says now.
  let writes: EntitlementWrite[];
  if (decision.action === 'lookup') {
    // Every lookup first, so a failure writes nothing and the retry starts
    // clean. The event's own timestamp is the cursor for all of them.
    const config = readLookupConfig((name: string) => env.get(name));
    writes = [];
    for (const userId of decision.lookupUserIds) {
      const result = await lookupPlus(userId, config, {
        fetch,
        now: Date.now,
        cache: lookupCache,
        log: (message: string) => console.error(message),
      });
      if (result.status === 'error') {
        // 500 so RevenueCat retries: a lookup that couldn't answer says
        // nothing about what this user owns.
        console.error(`[revenuecat] ${decision.reason}: lookup failed (${result.reason})`);
        return json({ error: 'lookup_failed' }, 500);
      }
      writes.push(writeFromLookup(userId, result, decision.eventMs));
    }
  } else if (decision.userId) {
    writes = [
      {
        userId: decision.userId,
        isPlus: decision.isPlus,
        source: decision.source,
        expiresAt: decision.expiresAt,
        eventMs: decision.eventMs,
      },
    ];
  } else {
    console.log('[revenuecat] ignored: a write with no user');
    return json({ ok: true, action: 'ignored', reason: 'no user' });
  }

  const admin = createClient(
    env.get('SUPABASE_URL')!,
    env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let written = 0;
  for (const write of writes) {
    // Upsert guarded by the event cursor (migration 004): an event older than
    // the one that last wrote this row is dropped. RevenueCat retries and does
    // not promise ordering, so a late RENEWAL must not resurrect an entitlement
    // that a newer EXPIRATION already ended.
    const { error } = await admin.rpc('apply_entitlement_event', toRpcArgs(write));

    if (error && isForeignKeyViolation(error)) {
      // The user is not in auth.users: a deleted account. Retrying can never
      // succeed, so acknowledge it. (Migration 004's function catches this
      // itself; this covers a live function that doesn't.)
      console.log(`[revenuecat] no such user ${write.userId}; nothing written`);
      continue;
    }
    if (error) {
      // 500 so RevenueCat retries. A dropped event here is a subscriber who
      // paid and can't use what they bought.
      console.error('[revenuecat] write failed', error);
      return json({ error: 'write_failed' }, 500);
    }
    written++;
    console.log(
      `[revenuecat] ${decision.reason} for ${write.userId} (is_plus=${write.isPlus})`,
    );
  }

  if (written === 0) {
    return json({ ok: true, action: 'ignored', reason: 'no such user' });
  }
  return json({ ok: true, action: 'written', reason: decision.reason });
});
