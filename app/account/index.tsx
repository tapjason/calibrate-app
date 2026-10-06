import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignInView } from '@/components/account/SignInView';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space } from '@/constants/theme';

export default function AccountScreen() {
  const router = useRouter();
  // Reachable from Settings and the Coach panel, both of which leave a back
  // stack; the fallback covers a cold deep link.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/settings' as never);

  // The canvas and the round close control, like the paywall: this screen has
  // no header either (roadmap step 66).
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <CloseButton onPress={close} testID="account-close" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <SignInView onDone={close} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  top: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.lg },
});
