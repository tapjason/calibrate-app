// Event recording (L5). One function, `track()`, that every caller in the app
// uses and nobody has to think about.
//
// Contract:
//   - It never throws, never returns a rejected promise, and never blocks.
//     Callers use `void track(...)` and move on; a failure here must be
//     invisible everywhere, exactly like the AI layer.
//   - It records nothing when the user has opted out, and clears what was
//     already queued the moment they do.
//   - It can only record events declared in events.ts, with properties
//     declared for that event. Freetext cannot reach it.
//   - It records nothing while the phone is local-only under the under-13
//     rule (roadmap D70): no usage counts are kept for upload. What was queued
//     before the rule came on is cleared then (src/age/localOnly.ts).
//
// Layer note: L5. It reads settingsStore, authStore and the age store (L4)
// the same way the notification services do — services subscribe to stores,
// never the reverse.

import { enqueueEvent, type QueuedEvent } from '@/db/analytics';
import { isLocalOnly } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

import { sanitizeProps, type EventName, type EventProps } from './events';

/**
 * Record an event. Fire-and-forget.
 *
 * `void track('share_completed', { surface: 'card' })`
 */
export async function track(name: EventName, props?: EventProps): Promise<void> {
  try {
    // The under-13 rule (D70): nothing is queued. `isLocalOnly`, not
    // `uploadsMayStart` (review round 2, item 4): queueing sends nothing, so
    // an event recorded while Apple's answer is pending (the Warm-up's first
    // screen is up then) stays on the phone; the flush sends only once
    // uploads may start (flush.ts), and an under-13 answer clears the queue
    // (src/age/localOnly.ts, `enter`), so none of it ever goes up.
    if (isLocalOnly()) return;
    if (!useSettingsStore.getState().analyticsEnabled) return;

    const userId = useAuthStore.getState().userId;
    // No identity yet means the app is still starting. An event with no owner
    // could not be scoped to a user server-side, so it is dropped rather than
    // stored under a placeholder.
    if (!userId) return;

    const event: QueuedEvent = {
      id: newId(),
      user_id: userId,
      name,
      props: sanitizeProps(name, props) as QueuedEvent['props'],
      created_at: new Date().toISOString(),
    };
    await enqueueEvent(event);
  } catch (e) {
    // enqueueEvent swallows its own errors; this is belt and braces so a
    // tracking call can never reject into a component's render or a save.
    // eslint-disable-next-line no-console
    console.warn('[analytics] track failed:', e);
  }
}

/**
 * Event id. Random rather than sequential so the server can dedupe retries by
 * primary key without the id itself carrying information about the user.
 */
function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
