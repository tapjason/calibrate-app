import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignInView } from '@/components/account/SignInView';
import { LocalOnlyPage } from '@/components/age/LocalOnlyPage';
import {
  LOCAL_ONLY_ACCOUNT_BODY,
  LOCAL_ONLY_ACCOUNT_TITLE,
  LOCAL_ONLY_FROZEN_ACCOUNT_TITLE,
  LOCAL_ONLY_FROZEN_FOOTER,
} from '@/components/age/localOnlyCopy';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, space } from '@/constants/theme';
import { useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';

export default function AccountScreen() {
  const router = useRouter();
  // The under-13 rule (roadmap D70): no account can be made or opened here,
  // so the sign-in view is never mounted, whatever opened this screen (a deep
  // link included). Read from the store, so a band that arrives while this is
  // open takes the form away at once. The store's sign-in actions refuse too.
  const localOnly = useAgeStore((s) => s.localOnly);
  // An account signed in before the rule came on is frozen, not gone: its
  // page says backup is off, in You's words for it, not "No account". The
  // same test as You's account group. Routes draw only once auth has
  // initialised (the root layout's gate), so this is never 'loading' here.
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  // Reachable from Settings and the Coach panel, both of which leave a back
  // stack; the fallback covers a cold deep link.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/you' as never);

  if (localOnly) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalOnlyPage
          title={signedIn ? LOCAL_ONLY_FROZEN_ACCOUNT_TITLE : LOCAL_ONLY_ACCOUNT_TITLE}
          body={signedIn ? LOCAL_ONLY_FROZEN_FOOTER : LOCAL_ONLY_ACCOUNT_BODY}
          onClose={close}
          testID="account-local-only"
        />
      </SafeAreaView>
    );
  }

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
