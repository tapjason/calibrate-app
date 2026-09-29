import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteAccountView } from '@/components/account/DeleteAccountView';
import { colors } from '@/constants/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const cancel = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/settings' as never);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView>
        <DeleteAccountView
          onCancel={cancel}
          // Afterwards the app is an empty guest; Home is the honest place to land.
          onDone={() => router.replace('/(tabs)' as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
});
