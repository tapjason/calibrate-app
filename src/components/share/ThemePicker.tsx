import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { Icon } from '@/components/ui/Icon';
import { CARD_THEMES, resolveTheme } from '@/constants/cardThemes';
import { colors, type } from '@/constants/theme';
import { useAgeStore } from '@/store/ageStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Card theme picker — the cosmetic half of Plus (GROWTH §3).
 *
 * The line this component has to hold: **the artifact is never paywalled.**
 * The free theme is always selectable and always exports at full quality; Plus
 * adds palettes. Tapping a locked one opens the paywall rather than silently
 * doing nothing, so the swatch is an offer and not a dead end.
 *
 * Locked themes are shown, not hidden — a cosmetic tier nobody can see is a
 * cosmetic tier nobody buys, and this is the one place where showing the
 * locked thing costs the user nothing.
 *
 * Except under the under-13 rule (roadmap D70), where Plus isn't offered: only
 * the themes this phone can use are drawn (the free one, and Plus's with a
 * Plus mirror already here), with no lock and nothing that opens the paywall.
 * With only the free one there is nothing to choose, so no picker at all.
 */
export function ThemePicker({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const localOnly = useAgeStore((s) => s.localOnly);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const setCardThemeId = useSettingsStore((s) => s.setCardThemeId);

  const active = resolveTheme(cardThemeId, isPlus);
  // A locked swatch is an offer; under the rule there is none to make.
  const themes = localOnly ? CARD_THEMES.filter((t) => !t.plus || isPlus) : CARD_THEMES;
  // One theme left (the free one, without a Plus mirror) is no choice: no
  // picker, and the card keeps that theme.
  if (themes.length < 2) return null;

  return (
    <View style={styles.wrap} testID="theme-picker">
      <Text style={styles.label}>Card theme</Text>
      <View style={styles.row}>
        {themes.map((theme) => {
          const locked = theme.plus && !isPlus;
          const selected = theme.id === active.id;
          return (
            <Pressable
              key={theme.id}
              testID={`theme-${theme.id}`}
              accessibilityRole="button"
              accessibilityLabel={
                locked ? `${theme.name} theme (Plus)` : `${theme.name} theme`
              }
              {...chosenProps('toggle', selected)}
              onPress={() => {
                if (locked) onUpgrade?.();
                else void setCardThemeId(theme.id);
              }}
              style={[
                styles.swatch,
                { backgroundColor: theme.background },
                selected && styles.selected,
              ]}
            >
              {/* A dot in the theme's own foreground doubles as a legibility
                  check: if it doesn't read against the background here, the
                  card won't either. */}
              <View style={[styles.dot, { backgroundColor: theme.foreground }]} />
              {locked && (
                // The theme's own foreground, so the mark reads on light
                // swatches (Paper) as well as dark ones.
                // A plain lock, not a sparkle (roadmap D33): it says what it
                // means, where ✦ read as the stock mark for "AI".
                <View style={styles.lock} testID={`theme-lock-${theme.id}`}>
                  <Icon sf="lock.fill" fallback="lock-closed" size={11} color={theme.foreground} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {isPlus || localOnly
          ? active.name
          : `${active.name}. Themes with a lock come with Plus. Every card exports the same either way.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  label: { ...type.eyebrow, color: colors.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 10,
    borderWidth: 2,
    // 44pt: the minimum comfortable tap target (DESIGN_SYSTEM §0 rule 7).
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  selected: { borderColor: colors.action },
  dot: { borderRadius: 5, height: 10, width: 10 },
  lock: {
    position: 'absolute',
    right: 4,
    top: 3,
  },
  hint: { ...type.caption, color: colors.textSecondary, fontWeight: '400' },
});
