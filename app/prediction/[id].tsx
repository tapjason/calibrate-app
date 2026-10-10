import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PredictionDetails } from '@/components/prediction/PredictionDetails';
import { CloseButton } from '@/components/ui/CloseButton';
import { space } from '@/constants/theme';

/**
 * An open prediction that isn't due yet (roadmap D25, DESIGN_SYSTEM §7.23),
 * as a sheet from Today or History. A due one opens Resolve instead.
 */
export default function PredictionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <CloseButton onPress={close} testID="details-close" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <PredictionDetails
          predictionId={typeof id === 'string' ? id : ''}
          onClose={close}
          // One sheet at a time (HIG): Resolve takes this one's place.
          onAnswer={(pid) => router.replace(`/resolve/${pid}` as never)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
});
