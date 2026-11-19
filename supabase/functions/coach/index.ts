// Coach Edge Function. Interprets a user's calibration statistics and returns
// 0–3 short, grounded insights. Runs on Supabase Edge Runtime (Deno).
//
// Authoritative spec: COACH_AGENT.md. This function implements §5 (safeguards),
// §6 (output contract), and §7 (system prompt).
//
// Contract — kept in lockstep with src/ai/coach.ts:
//   Request:   POST { context: CoachContext }
//              Authorization: Bearer <user JWT>   // a real signed-in user
//   Response:  200 { insights: CoachInsight[], safe: boolean, dropped?: number }
//              // dropped (2026-11-19): how many of the model's insights the
//              // validator dropped, when any were; builds before it ignore it
//              400 { error }  // payload failed validation, or too large
//              401 { error }  // missing / non-user token
//              403 { error: 'not_entitled' }  // no Plus: neither the
//                             // entitlements row nor RevenueCat says so
//              429 { error }  // rate limit or daily cost ceiling
//              500 { error }  // OpenAI or server error
//
// The client treats every non-2xx as a silent no-op (§5.8) — nothing here can
// block Log → Resolve → Stats. A 403 gets its own words in the Coach panel
// ("couldn't confirm your Plus subscription yet"), nothing more.
//
// The request parser, the output validator and the prompt live in
// ./contract.ts, plain TypeScript Jest can test (contract.test.ts). The same
// output rules are written again in src/ai/coachValidate.ts ON PURPOSE (Deno
// can't import from the React Native bundle; COACH_AGENT.md §3 asks for
// "server + client"), and src/ai/coachLockstep.test.ts runs one fixture set
// through both so they can't drift. Change a rule in one, change the other.
//
// Compatibility (2026-11-18, 2026-11-19): this function accepts every payload
// the app builds have sent (by_category of built-ins; patterns
// weakest_day_of_week, weakest_day_score and drift_<built-in>, at most 7),
// plus the weakest_day_answers pattern builds from 2026-11-18 add and the
// drift_half_answers_<built-in> patterns builds from 2026-11-19 add (at most
// 13 in all). A build that doesn't send a floor's count never gets that
// figure cited: the weekday score without the day's count, a drift without
// its halves' count.
//
// Deploy:
//   supabase functions deploy coach
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase secrets set REVENUECAT_READ_KEY=sk_...   # step 189, below
//   psql < supabase/migrations/002_coach_usage.sql
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// by the platform. COACH_ALLOW_UNENTITLED must be unset in production.
//
// The Plus gate asks RevenueCat when the entitlements row doesn't say Plus
// (step 189; ./plusGate.ts, ../_shared/revenuecatLookup.ts). That needs
// REVENUECAT_READ_KEY (a v2 secret key with customer_information:customers:read
// and project_configuration:entitlements:read, nothing else) and
// REVENUECAT_PROJECT_ID. Without them every lookup fails and the gate reads
// the row alone.

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import OpenAI from 'npm:openai@4.104.0';
// Pinned to the version the app has installed (package.json, 2026-11-18), so
// a deploy never picks up a supabase-js the app hasn't run against.
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';

// The .ts extension is required by Deno and rejected by the project's
// tsconfig (TS5097), as in revenuecat-webhook. These modules are typechecked
// through their Jest tests.
import {
  MAX_BODY_BYTES,
  parseContext,
  readBodyCapped,
  SYSTEM_PROMPT,
  userMessage,
  validateOutput,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from './contract.ts';
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { createNoneMemory, decidePlusGate } from './plusGate.ts';
import {
  createLookupCache,
  lookupPlus,
  readLookupConfig,
  toRpcArgs,
  // @ts-expect-error — Deno module resolution, not TypeScript's.
} from '../_shared/revenuecatLookup.ts';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

// Burst limiter, same best-effort per-isolate design as refine. Tighter,
// because a Coach call costs meaningfully more than a refine.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 4;
const hits = new Map<string, number[]>();

/** The plus entitlement's RevenueCat id, read once per isolate. */
const lookupCache = createLookupCache();

/** RevenueCat's "no Plus" answers, remembered per isolate (./plusGate.ts). */
const noneMemory = createNoneMemory();

/** Durable per-user daily ceiling (§5.7). Backed by public.coach_usage. */
const DAILY_CALL_CEILING = 25;

/**
 * The model call's own deadline, under the app's 12 s (src/ai/coach.ts), with
 * no retries: a slow or failed call is one the app has already given up on,
 * and the SDK's defaults (10 minutes, 2 retries) would keep spending on it.
 */
const OPENAI_TIMEOUT_MS = 10_000;
const OPENAI_MAX_RETRIES = 0;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// @ts-expect-error — Deno.serve is the Edge Runtime entry point.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // --- Auth: a real signed-in user, never the bare anon key (§5.7). ---
  const token = (req.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = env.get('SUPABASE_URL');
  const supabaseAnonKey = env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('Supabase env vars not set');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    return json({ error: 'A signed-in account is required to use Coach' }, 401);
  }

  if (rateLimited(user.id)) {
    return json({ error: 'Rate limit exceeded, try again shortly' }, 429);
  }

  // --- Input size cap (§5.7): the declared length first, then what arrives,
  // so a huge body is refused before it is read and never held whole. ---
  const body = await readBodyCapped(req.headers.get('Content-Length'), req.body, MAX_BODY_BYTES);
  if (!body.ok) {
    return json({ error: body.reason === 'too_large' ? 'Payload too large' : 'Unreadable body' }, 400);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body.text);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const context = parseContext((parsedBody as { context?: unknown } | null)?.context);
  if (!context) return json({ error: 'Invalid context payload' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Plus gate. Server-side, because the client-side one is a suggestion. ---
  //
  // Coach is a paid feature calling a paid model. Checking entitlement only in
  // src/ai/coach.ts means any signed-in free user, or anyone posting here
  // directly, gets it on your billing.
  //
  // COACH_ALLOW_UNENTITLED=true bypasses this, for testing the endpoint before
  // billing exists to populate the table. Leave it unset in production —
  // with it set, this gate does nothing.
  //
  // After the JWT and the burst limit on purpose: the RevenueCat lookup below
  // costs a call to a third party, so only a real, unthrottled user gets one,
  // and a "no" is remembered for a while (noneMemory) so one free account
  // can't spend the key's shared rate budget.
  if (env.get('COACH_ALLOW_UNENTITLED') !== 'true') {
    const { data: ent, error: entError } = await admin
      .from('entitlements')
      .select('is_plus, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (entError) {
      // Fail closed, same reasoning as the ceiling below: an entitlement check
      // that opens when its lookup breaks is not an entitlement check.
      console.error('entitlement lookup failed', entError);
      return json({ error: 'Entitlement check unavailable' }, 500);
    }

    // No row means free (CLAUDE.md: absence defaults to free, never Plus),
    // unless RevenueCat itself says Plus: the webhook can miss a purchase
    // (./plusGate.ts). Only RevenueCat's own yes opens this.
    const now = Date.now();
    const gate = await decidePlusGate(
      user.id,
      ent,
      now,
      () =>
        lookupPlus(user.id, readLookupConfig((name: string) => env.get(name)), {
          fetch,
          now: Date.now,
          cache: lookupCache,
          log: (message: string) => console.error(message),
        }),
      noneMemory,
    );

    if (!gate.entitled) {
      console.log(`[coach] not entitled: ${gate.reason}`);
      return json({ error: 'not_entitled' }, 403);
    }

    if (gate.via === 'lookup') {
      // Land the row the webhook missed, through the same guarded upsert, with
      // a cursor a minute behind now (LOOKUP_CURSOR_LAG_MS, ./plusGate.ts), so
      // the next call needs no lookup. A failed write still serves this
      // request: RevenueCat has just said Plus.
      const { error: writeError } = await admin.rpc(
        'apply_entitlement_event',
        toRpcArgs(gate.write),
      );
      if (writeError) {
        console.error('[coach] entitlement write after lookup failed', writeError);
      } else {
        console.log('[coach] entitlement row written from a RevenueCat lookup');
      }
    }
  }

  // --- Daily cost ceiling (§5.7). Durable, so it survives isolate recycling. ---
  // Bumped after the Plus gate, so a rejected free user neither consumes quota
  // nor leaves usage rows that misrepresent who is actually costing money.
  const { data: calls, error: usageError } = await admin.rpc('bump_coach_usage', {
    p_user_id: user.id,
  });
  if (usageError || typeof calls !== 'number') {
    // Fail CLOSED. A spend cap that opens when its bookkeeping breaks is not a
    // spend cap, and the Coach is non-essential by design — the client renders
    // nothing and the core loop is untouched.
    console.error('coach_usage bump failed', usageError);
    return json({ error: 'Usage ledger unavailable' }, 500);
  }
  if (calls > DAILY_CALL_CEILING) {
    return json({ error: 'Daily Coach limit reached' }, 429);
  }

  const apiKey = env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const openai = new OpenAI({
      apiKey,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      // Low, per §7: this is interpretation of fixed numbers, not writing.
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        // Delimited as data (§5.2). Everything inside is machine-generated
        // by parseContext above — no user prose reaches this point.
        { role: 'user', content: userMessage(context) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A non-JSON reply is discarded whole (§5.8) rather than salvaged, and
      // counted as dropped: the app says nothing could be backed, not that
      // there was nothing to say.
      console.error('Coach returned non-JSON');
      return json({ insights: [], safe: true, dropped: 1 });
    }

    return json(validateOutput(parsed, context));
  } catch (e) {
    console.error('OpenAI request failed', e);
    // Detail stays server-side. Echoing e.message to the caller leaks the
    // upstream provider, its account billing state, and its dashboard URL to
    // anyone holding a JWT; the client discards this body regardless.
    return json({ error: 'internal' }, 500);
  }
});
