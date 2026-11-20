import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { supportResource, type CrisisTopic } from '@/ai/crisisFilter';
import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/constants/theme';
import type { SupportAsideOutcome } from '@/store/coachStore';

interface SupportSurfaceProps {
  topic: CrisisTopic;
  /**
   * "Back to Coach" (D71 (b), `useCoachStore.backToCoach`). Resolves to what
   * it did: 'aside' and 'cleared' take the card away with the panel's state
   * (the panel moves VoiceOver to its heading and says so); 'updated' has put
   * another topic's card in this one's place, nothing set aside (VoiceOver
   * moves to the card's title, and the button rests a second); 'failed'
   * leaves the card as it was. A rejection reads as 'failed'. No button
   * without it.
   */
  onSetAside?: () => Promise<SupportAsideOutcome>;
}

/**
 * Why the card came up, and that it can be set aside, under its contact line
 * (main session decision 2026-11-19): an answered prediction can't be deleted
 * after its 24 hours, so one false match would otherwise replace the Coach
 * for good. About where the words were checked, never about the person.
 */
export const SUPPORT_ASIDE_NOTE =
  "This came up because of words in one of your predictions or notes, checked on this phone. If it doesn't fit, you can go back to Coach.";

/**
 * After "Back to Coach" found words of a topic whose card hadn't been shown
 * (`'updated'`): the card now says something else, and nothing was set
 * aside. Shown above the button and said, until the card goes or changes again.
 */
export const SUPPORT_UPDATED_NOTE = 'Other words matched too, so this message changed.';

/** "Back to Coach" couldn't be done (`'failed'`): the card stays. Shown and said. */
export const SUPPORT_ASIDE_FAILED = "Couldn't go back to Coach. Try again.";

/** What VoiceOver hears once the card has gone and the Coach is back. Said by the panel. */
export const BACK_TO_COACH_SPOKEN = 'Back to Coach.';

/**
 * How long a line waits after VoiceOver's focus is moved, before it is said,
 * queued behind what is being read: a same-moment announcement was cut off by
 * a focus move on Resolve (code review 2026-11-12). The panel's "Back to
 * Coach." uses it too (`BACK_TO_COACH_ANNOUNCE_MS`).
 */
export const ANNOUNCE_AFTER_FOCUS_MS = 600;

/**
 * How long "Back to Coach" stays off after the card changes under it: a quick
 * second tap, or VoiceOver's next double-tap, would otherwise set the new card
 * aside before anyone had read or heard it (re-review 2026-11-19).
 */
export const SUPPORT_CHANGED_HOLD_MS = 1000;

/** Said after what VoiceOver is reading; at once where there is no queue (web). */
function sayQueued(text: string): void {
  if (typeof AccessibilityInfo.announceForAccessibilityWithOptions === 'function') {
    AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  } else {
    AccessibilityInfo.announceForAccessibility(text);
  }
}

/**
 * The `safe: false` path (COACH_AGENT.md §5.5). Shown instead of any coaching
 * when the crisis pre-filter trips.
 *
 * Deliberately plain. This is not a Coach card wearing different colors — no
 * insight, no statistic, no suggestion, nothing that reads as the app having
 * an opinion about the person. It steps back and points to humans, which is
 * the entire specified behavior. The way back to Coach sits under the contact
 * line, in the same plain words and a secondary button: no icon, no colour.
 * What the button did, when the card stays, is one plain line above it in the
 * same ink, never a colour.
 *
 * The copy makes no promise about confidentiality or outcome, and never names
 * or implies a condition.
 */
export function SupportSurface({ topic, onSetAside }: SupportSurfaceProps) {
  const [busy, setBusy] = useState(false);
  // How many times the topic has changed under this card while it stayed up:
  // the line about other words belongs to the change its tap brought, and
  // goes with the next one. Kept from the previous render (React's "storing
  // information from previous renders"), so it is right on the very render
  // the new topic arrives in.
  const [cardTopic, setCardTopic] = useState(topic);
  const [changes, setChanges] = useState(0);
  // "Back to Coach" is off for SUPPORT_CHANGED_HOLD_MS after the card
  // changes, from the very render the new topic arrives in, so it is never
  // offered for a card nobody has had a moment to see.
  const [holding, setHolding] = useState(false);
  if (cardTopic !== topic) {
    setCardTopic(topic);
    setChanges(changes + 1);
    setHolding(true);
  }
  // The value of `changes` when the tap behind each line was made, or null.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  // One tap at a time, before the disabled state has drawn.
  const running = useRef(false);
  // Set aside or cleared, the card goes with the panel's state: nothing to update then.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The hold ends a second after the latest change; a change inside it starts
  // the second again. Cleared when the card goes.
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setHolding(false), SUPPORT_CHANGED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [holding, changes]);

  // After 'updated' the card says something else, perhaps with another
  // helpline, while VoiceOver is still on the button: it is moved to the
  // card's title, so the new card is read from the top before the button can
  // be reached again, and the line about other words is said a moment later,
  // queued behind what is being read. Counted, so each 'updated' runs this
  // once, after the new card has committed. Cleared when the card goes.
  const title = useRef<Text>(null);
  const [cardChanged, setCardChanged] = useState(0);
  useEffect(() => {
    if (cardChanged === 0) return;
    const node = title.current;
    // Not on web, whose AccessibilityInfo has no focus event.
    if (node && typeof AccessibilityInfo.sendAccessibilityEvent === 'function') {
      AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }
    const timer = setTimeout(() => sayQueued(SUPPORT_UPDATED_NOTE), ANNOUNCE_AFTER_FOCUS_MS);
    return () => clearTimeout(timer);
  }, [cardChanged]);

  const resource = supportResource({ safe: false, topic });
  if (!resource) return null;

  const setAside = async () => {
    if (!onSetAside || running.current) return;
    running.current = true;
    const at = changes;
    setBusy(true);
    // A second try starts without the last one's failure; said again if it fails again.
    setFailedAt(null);
    let outcome: SupportAsideOutcome;
    try {
      outcome = await onSetAside();
    } catch {
      outcome = 'failed';
    }
    running.current = false;
    if (!live.current) return;
    // Still here: the button is offered again ('updated', for the new card,
    // once its hold is over; 'failed', for this one).
    setBusy(false);
    if (outcome === 'updated') {
      setUpdatedAt(at);
      // Held already by the topic's change; held here too, so the second
      // never rests on the change arriving before the outcome.
      setHolding(true);
      setCardChanged((n) => n + 1);
    } else if (outcome === 'failed') {
      setFailedAt(at);
      AccessibilityInfo.announceForAccessibility(SUPPORT_ASIDE_FAILED);
    }
  };

  // The change the tap brought is `at + 1`; with none (the topic stayed), the
  // line still shows. A later change takes it away.
  const showUpdated = updatedAt !== null && changes - updatedAt <= 1;
  const showFailed = failedAt !== null && changes === failedAt;

  return (
    <View style={styles.card} testID="coach-support-surface">
      <Text ref={title} style={styles.title} testID="support-title">
        {resource.title}
      </Text>
      <Text style={styles.body}>{resource.body}</Text>
      {/* Selectable: a number or a line someone may want to copy. */}
      <Text style={styles.contact} selectable testID="support-contact">
        {resource.contact}
      </Text>
      {onSetAside && (
        <>
          <Text style={styles.aside} testID="support-aside-note">
            {SUPPORT_ASIDE_NOTE}
          </Text>
          {showUpdated && (
            <Text style={styles.status} testID="support-updated-note">
              {SUPPORT_UPDATED_NOTE}
            </Text>
          )}
          {showFailed && (
            <Text style={styles.status} testID="support-aside-failed">
              {SUPPORT_ASIDE_FAILED}
            </Text>
          )}
          <Button
            label="Back to Coach"
            variant="secondary"
            onSunken
            disabled={busy || holding}
            onPress={() => void setAside()}
            testID="support-back-to-coach"
          />
        </>
      )}
    </View>
  );
}

// Sunken and borderless: nothing here borrows the Coach card's chrome
// (DESIGN_SYSTEM §7.13).
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  contact: { ...type.subhead, color: colors.textPrimary, fontWeight: '600' },
  // Quieter than the body: a note about the card, under the line that matters.
  aside: { ...type.footnote, color: colors.textSecondary },
  // What the tap did: in the body's size and full ink, so it reads over the
  // note above it, and no colour (no red on this card; §7.13).
  status: { ...type.subhead, color: colors.textPrimary },
});
