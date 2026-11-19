import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { supportResource, type CrisisTopic } from '@/ai/crisisFilter';
import { Button } from '@/components/ui/Button';
import { colors, radius, space, type } from '@/constants/theme';

interface SupportSurfaceProps {
  topic: CrisisTopic;
  /**
   * "Back to Coach": sets the card aside (main session decision 2026-11-19,
   * `useCoachStore.setSupportAside`). Resolves true when it was, and the
   * panel then goes back to its ask button; false leaves the card up. No
   * button without it.
   */
  onSetAside?: () => Promise<boolean>;
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
 * The `safe: false` path (COACH_AGENT.md §5.5). Shown instead of any coaching
 * when the crisis pre-filter trips.
 *
 * Deliberately plain. This is not a Coach card wearing different colors — no
 * insight, no statistic, no suggestion, nothing that reads as the app having
 * an opinion about the person. It steps back and points to humans, which is
 * the entire specified behavior. The way back to Coach sits under the contact
 * line, in the same plain words and a secondary button: no icon, no colour.
 *
 * The copy makes no promise about confidentiality or outcome, and never names
 * or implies a condition.
 */
export function SupportSurface({ topic, onSetAside }: SupportSurfaceProps) {
  const [busy, setBusy] = useState(false);
  // Set aside, the card goes with the panel's state: nothing to update then.
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const resource = supportResource({ safe: false, topic });
  if (!resource) return null;

  const setAside = async () => {
    if (!onSetAside || busy) return;
    setBusy(true);
    try {
      await onSetAside();
    } finally {
      // Still here: it wasn't set aside (false), so the button is offered again.
      if (live.current) setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="coach-support-surface">
      <Text style={styles.title}>{resource.title}</Text>
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
          <Button
            label="Back to Coach"
            variant="secondary"
            onSunken
            disabled={busy}
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
});
