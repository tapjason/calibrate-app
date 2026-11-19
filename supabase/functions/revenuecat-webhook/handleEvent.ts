// What the webhook does with one authenticated, parsed event: decide, look up
// when told to, write, and choose the answer RevenueCat gets.
//
// Plain TypeScript with no Deno imports, like ./entitlementFromEvent.ts, so
// Jest can run the whole flow (security review, 2026-11-18): the lookup and
// the write are injected. index.ts is the transport around it: the shared
// secret, the body cap, JSON, and the real RevenueCat lookup and RPC.
//
// The answer RevenueCat sees:
//   200 { ok: true, action: 'ignored' | 'written', reason }
//       Handled, or deliberately ignored. Exactly 200: RevenueCat counts any
//       other status, even another 2xx, as a failed delivery.
//   500 { error: 'lookup_failed' | 'write_failed' }
//       RevenueCat retries (up to 5 times over about 80 minutes, with the same
//       event id and event_timestamp_ms).
//
// Replays and out-of-order deliveries are handled by the event cursor in
// `apply_entitlement_event` (migration 004): every write carries the event's
// timestamp, a row is overwritten only by an event at least as new as the one
// that last wrote it, and `<=` makes a retried delivery of the same event
// idempotent. A lookup's write carries the event's own timestamp too, so a
// lookup can't jump ahead of an event RevenueCat sent later.

import type { EntitlementWrite, PlusLookup } from '../_shared/revenuecatLookup.ts';
// The .ts extension is required by Deno and rejected by the project's
// tsconfig (TS5097); Jest resolves the path as written.
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { writeFromLookup } from '../_shared/revenuecatLookup.ts';
import type { DecisionOptions } from './entitlementFromEvent.ts';
// @ts-expect-error — Deno module resolution, not TypeScript's.
import { decideFromEvent } from './entitlementFromEvent.ts';

/** What one `apply_entitlement_event` call came to. */
export type WriteOutcome =
  /** The call succeeded (the cursor may still have kept an older row). */
  | 'written'
  /** The user isn't in auth.users (a deleted account): nothing to write, ever. */
  | 'no_user'
  /** Anything else. RevenueCat should retry. */
  | 'failed';

export interface WebhookDeps {
  /** Clock for the expiry comparison; index.ts passes Date.now. */
  now: () => number;
  options?: DecisionOptions;
  /** Asks RevenueCat about one Supabase user. Expected never to throw. */
  lookup: (userId: string) => Promise<PlusLookup>;
  /** One guarded upsert through `apply_entitlement_event`. Expected never to throw. */
  write: (write: EntitlementWrite) => Promise<WriteOutcome>;
  /** Server log. Never given a key or a token. */
  log?: (message: string) => void;
}

export interface WebhookReply {
  status: 200 | 500;
  body: Record<string, unknown>;
}

const failed = (error: 'lookup_failed' | 'write_failed'): WebhookReply => ({
  status: 500,
  body: { error },
});

async function safeLookup(deps: WebhookDeps, userId: string): Promise<PlusLookup> {
  try {
    return await deps.lookup(userId);
  } catch {
    return { status: 'error', reason: 'network' };
  }
}

async function safeWrite(deps: WebhookDeps, w: EntitlementWrite): Promise<WriteOutcome> {
  try {
    return await deps.write(w);
  } catch {
    return 'failed';
  }
}

/** Handle one event whose sender has already been authenticated. Never throws. */
export async function handleWebhookEvent(
  body: unknown,
  deps: WebhookDeps,
): Promise<WebhookReply> {
  const log = deps.log ?? (() => undefined);
  const decision = decideFromEvent(body, deps.now(), deps.options ?? {});

  // An ignored event is a success. Anything else makes RevenueCat retry a
  // delivery that will never do anything.
  if (decision.action === 'ignore') {
    log(`[revenuecat] ignored: ${decision.reason}`);
    return { status: 200, body: { ok: true, action: 'ignored', reason: decision.reason } };
  }

  let writes: EntitlementWrite[];
  if (decision.action === 'lookup') {
    // Every lookup first, so a failure writes nothing it wasn't told to and
    // the retry starts clean. The event's own timestamp is the cursor.
    writes = [];
    for (const userId of decision.lookupUserIds) {
      const result = await safeLookup(deps, userId);
      if (result.status === 'error') {
        log(`[revenuecat] ${decision.reason}: lookup failed (${result.reason})`);
        if (decision.failClosed) {
          // A refund must not stay Plus because RevenueCat couldn't be asked.
          // Free now; the retry's lookup writes the truth with the same
          // cursor, which `<=` lets through.
          const outcome = await safeWrite(deps, writeFromLookup(userId, { status: 'none' }, decision.eventMs));
          log(`[revenuecat] ${decision.reason}: wrote free until a lookup answers (${outcome})`);
        }
        return failed('lookup_failed');
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
    log('[revenuecat] ignored: a write with no user');
    return { status: 200, body: { ok: true, action: 'ignored', reason: 'no user' } };
  }

  let written = 0;
  for (const w of writes) {
    const outcome = await safeWrite(deps, w);
    if (outcome === 'no_user') {
      // A deleted account. Retrying can never succeed, so acknowledge it.
      log(`[revenuecat] no such user ${w.userId}; nothing written`);
      continue;
    }
    if (outcome === 'failed') {
      // A dropped event here is a subscriber who paid and can't use what they
      // bought, or a refund still reading as Plus. Retry.
      log('[revenuecat] write failed');
      return failed('write_failed');
    }
    written++;
    log(`[revenuecat] ${decision.reason} for ${w.userId} (is_plus=${w.isPlus})`);
  }

  if (written === 0) {
    return { status: 200, body: { ok: true, action: 'ignored', reason: 'no such user' } };
  }
  return { status: 200, body: { ok: true, action: 'written', reason: decision.reason } };
}
