import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, space, type } from '@/constants/theme';
import { MIN_PASSWORD_LENGTH, passwordRules, type PasswordRules } from '@/supabase/auth';

/**
 * Each rule as shown and as VoiceOver says it. The letters and digits that
 * count are only A–Z, a–z and 0–9, as on the server (`passwordRules`), so
 * each row names its range: "Éxample1" left "An uppercase letter" unmet
 * with nothing to say why (security review, 2026-11-18). Spoken with "to",
 * so the dash isn't read out.
 */
const RULES: ReadonlyArray<{ key: keyof PasswordRules; label: string; spoken: string }> = [
  {
    key: 'length',
    label: `${MIN_PASSWORD_LENGTH} or more characters`,
    spoken: `${MIN_PASSWORD_LENGTH} or more characters`,
  },
  { key: 'upper', label: 'An uppercase letter (A–Z)', spoken: 'An uppercase letter, A to Z' },
  { key: 'lower', label: 'A lowercase letter (a–z)', spoken: 'A lowercase letter, a to z' },
  { key: 'digit', label: 'A number (0–9)', spoken: 'A number, 0 to 9' },
];

/** The rows' icon, set on the first line of its row. */
const RULE_ICON = 16;

/**
 * Create account's password rules under the field, one row each, met or not
 * as the password is typed (step 190). The icon changes shape, not colour: a
 * hollow circle until the rule is met, then a filled check (DESIGN_SYSTEM
 * §2.4's outcome glyph), with the row's words in ink from quieter grey.
 *
 * Each row is one VoiceOver stop that says whether it's met. Nothing is
 * announced as the password changes: a line per keystroke would talk over
 * the typing, and the rows are there to read whenever the person moves to them.
 */
export function PasswordChecklist({ password }: { password: string }) {
  const met = passwordRules(password);
  return (
    <View style={styles.list} testID="account-password-hint">
      {RULES.map((rule) => {
        const ok = met[rule.key];
        return (
          <View
            key={rule.key}
            style={styles.row}
            testID={`account-password-rule-${rule.key}`}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${rule.spoken}, ${ok ? 'met' : 'not met'}`}
          >
            <View style={styles.iconBox}>
              <Icon
                sf={ok ? 'checkmark.circle.fill' : 'circle'}
                fallback={ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={RULE_ICON}
                color={ok ? colors.textPrimary : colors.textSecondary}
                testID={`account-password-rule-${rule.key}-icon`}
              />
            </View>
            <Text style={[styles.label, ok && styles.labelMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs, marginTop: space.xs },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: space.sm },
  // Centred on the first line, so a label that wraps at a large text size
  // keeps its icon beside its start.
  iconBox: { paddingTop: (type.footnote.lineHeight - RULE_ICON) / 2 },
  // Shrinks to the row's width, so a long label wraps beside the icon.
  label: { ...type.footnote, color: colors.textSecondary, flexShrink: 1 },
  labelMet: { color: colors.textPrimary },
});
