import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space, type } from '@/constants/theme';

import { LOCAL_ONLY_CLOSE } from './localOnlyCopy';

/**
 * What the paywall and account routes show while the under-13 rule applies
 * (roadmap D70; docs/design/research/under-13-2026-11.md, "Screens"): both
 * are reachable by deep link, so each route draws this page instead of its
 * own view, which is then never mounted. A title, one plain paragraph and the
 * way out, laid out as the account screen is (the round × at the top, the
 * text left-aligned under it), with nothing that offers a purchase or a
 * sign-in. The route insets the top edge, as each already does.
 *
 * "Close" as the one capsule as well as the ×: the spec names the button, and
 * on a page with nothing else to do it is the obvious way back.
 */
export function LocalOnlyPage({
  title,
  body,
  onClose,
  testID,
}: {
  title: string;
  body: string;
  onClose: () => void;
  testID: string;
}) {
  return (
    <View style={styles.page} testID={testID}>
      <View style={styles.top}>
        <CloseButton onPress={onClose} testID={`${testID}-dismiss`} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
        <Button label={LOCAL_ONLY_CLOSE} onPress={onClose} testID={`${testID}-close`} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.canvas, flex: 1 },
  // The account screen's row for the × (app/account/index.tsx).
  top: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.lg },
  // SignInView's measure: the title, then its paragraph, then the button.
  content: { gap: space.md, padding: space.xxl },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary, marginBottom: space.sm },
});
