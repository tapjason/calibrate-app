// Refine Edge Function. Rewrites a user-typed prediction into a concise,
// yes/no-resolvable form via OpenAI. Runs on Supabase Edge Runtime (Deno).
//
// Contract — kept in lockstep with src/ai/refine.ts:
//   Request:   POST { prediction: string }      // 1..500 chars after trim
//              Authorization: Bearer <user JWT>  // a real signed-in user
//   Response:  200 { refined: string }          // <= 200 chars
//              400 { error: string }            // input failed validation
//              401 { error: string }            // missing / non-user token
//              429 { error: string }            // per-user rate limit hit
//              500 { error: string }            // OpenAI or server error
//
// The client (src/ai/refine.ts) treats every non-2xx response as a silent
// failure and falls back to the user's original text, so the exact error
// shape doesn't bubble into the UI — but we return useful messages for
// dashboard/log debugging.
//
// Auth: the function is invoked through the Supabase client, which attaches
// the user's JWT when signed in or the public anon key in guest mode. We
// require a *real authenticated user* — the bare anon key is rejected with
// 401. This closes the abuse vector where anyone holding the public anon key
// (it ships in the client bundle) could call refine and burn OpenAI tokens.
// Refine is non-essential and the client degrades to the user's original
// text on any non-2xx, so gating it behind sign-in costs nothing in guest
// mode. Cost control is defense-in-depth: auth gate + per-user rate limit +
// input-length validation.
//
// Deploy (verify_jwt left ON so the gateway also rejects malformed tokens):
//   supabase functions deploy refine
//   supabase secrets set OPENAI_API_KEY=sk-...
// SUPABASE_URL and SUPABASE_ANON_KEY are injected by the platform.

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import OpenAI from 'npm:openai@4.104.0';
// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import { createClient } from 'npm:@supabase/supabase-js@2';

// @ts-expect-error — Deno global, not present in the project's TS lib.
const env = Deno.env;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_INPUT_LEN = 500;
const MAX_OUTPUT_LEN = 200;

// Per-user rate limit. Best-effort, in-memory, per-isolate — Supabase may run
// several isolates so the effective ceiling is a small multiple of this, which
// is fine: the goal is to blunt a single user hammering the endpoint, not to
// meter billing precisely. State resets whenever an isolate is recycled.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const PROMPT = (prediction: string): string =>
  `Rewrite this prediction to be concise and resolvable with a clear yes/no. ` +
  `Keep it under 15 words. Return only the rewritten prediction, nothing else.\n\n` +
  `Prediction: ${prediction}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// @ts-expect-error — Deno.serve is the Edge Runtime entry point.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // --- Auth gate: require a real signed-in user, not the bare anon key. ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = env.get('SUPABASE_URL');
  const supabaseAnonKey = env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY not set');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // getUser validates the JWT signature/expiry server-side and resolves the
  // user. The anon key carries no user, so guests fall through to 401.
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    return json({ error: 'A signed-in account is required to use refine' }, 401);
  }

  if (rateLimited(user.id)) {
    return json({ error: 'Rate limit exceeded, try again shortly' }, 429);
  }

  let prediction: unknown;
  try {
    const body = await req.json();
    prediction = (body as { prediction?: unknown }).prediction;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof prediction !== 'string') {
    return json({ error: 'prediction must be a string' }, 400);
  }
  const trimmed = prediction.trim();
  if (trimmed.length === 0) {
    return json({ error: 'prediction is empty' }, 400);
  }
  if (trimmed.length > MAX_INPUT_LEN) {
    return json({ error: `prediction exceeds ${MAX_INPUT_LEN} chars` }, 400);
  }

  const apiKey = env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 60,
      temperature: 0.4,
      messages: [{ role: 'user', content: PROMPT(trimmed) }],
    });

    const refined = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!refined) {
      return json({ error: 'OpenAI returned an empty response' }, 500);
    }
    // Defensive truncation: the prompt asks for <15 words, but a misbehaving
    // model could return a paragraph. Cap it before sending downstream.
    const clipped =
      refined.length > MAX_OUTPUT_LEN
        ? refined.slice(0, MAX_OUTPUT_LEN)
        : refined;

    return json({ refined: clipped });
  } catch (e) {
    console.error('OpenAI request failed', e);
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
