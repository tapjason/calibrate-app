// Refine Edge Function. Rewrites a user-typed prediction into a concise,
// yes/no-resolvable form via OpenAI. Runs on Supabase Edge Runtime (Deno).
//
// Contract — kept in lockstep with src/ai/refine.ts:
//   Request:   POST { prediction: string }      // 1..500 chars after trim
//   Response:  200 { refined: string }          // <= 200 chars
//              400 { error: string }            // input failed validation
//              500 { error: string }            // OpenAI or server error
//
// The client (src/ai/refine.ts) treats every non-2xx response as a silent
// failure and falls back to the user's original text, so the exact error
// shape doesn't bubble into the UI — but we return useful messages for
// dashboard/log debugging.
//
// Auth: the function is invoked through the Supabase client which attaches
// the user's JWT (or the anon key in guest mode). We do NOT require an
// authenticated user here — refine is meant to work pre-signin too. Cost
// control comes from input-length validation + Supabase function rate
// limits, not auth gating.
//
// Deploy:
//   supabase functions deploy refine --no-verify-jwt
//   supabase secrets set OPENAI_API_KEY=sk-...

// @ts-expect-error — Deno-only import; the Supabase Edge Runtime resolves it.
import OpenAI from 'npm:openai@4.104.0';

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
