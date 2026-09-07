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
//
// Layer note: L5. It reads settingsStore and authStore (L4) the same way the
// notification services do — services subscribe to stores, never the reverse.

import { enqueueEvent, type QueuedEvent } from '@/db/analytics';
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
