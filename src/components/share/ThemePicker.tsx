import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CARD_THEMES, resolveTheme } from '@/constants/cardThemes';
import { colors, type } from '@/constants/theme';
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
 */
export function ThemePicker({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const setCardThemeId = useSettingsStore((s) => s.setCardThemeId);

  const active = resolveTheme(cardThemeId, isPlus);

  return (
    <View style={styles.wrap} testID="theme-picker">
      <Text style={styles.label}>Card theme</Text>
      <View style={styles.row}>
        {CARD_THEMES.map((theme) => {
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
              accessibilityState={{ selected }}
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
                <Text
                  style={[styles.lock, { color: theme.foreground }]}
                  testID={`theme-lock-${theme.id}`}
                >
                  ✦
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        {isPlus
          ? active.name
          : `${active.name} · ✦ themes come with Plus. Every card exports the same either way.`}
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
  selected: { borderColor: colors.brand600 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  lock: {
    fontSize: 11, // never below 11pt (DESIGN_SYSTEM §0 rule 7)
    position: 'absolute',
    right: 4,
    top: 3,
  },
  hint: { ...type.caption, color: colors.textSecondary, fontWeight: '400' },
});
