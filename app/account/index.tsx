import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignInView } from '@/components/account/SignInView';
import { colors, type } from '@/constants/theme';

export default function AccountScreen() {
  const router = useRouter();
  // Reachable from Settings and the Coach panel, both of which leave a back
  // stack; the fallback covers a cold deep link.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/settings' as never);

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.close}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled">
        <SignInView onDone={close} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  close: { alignSelf: 'flex-end', padding: 16 },
  closeText: { ...type.body, color: colors.brandText },
});
