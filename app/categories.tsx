import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryManager } from '@/components/settings/CategoryManager';
import { CloseButton } from '@/components/ui/CloseButton';
import { space } from '@/constants/theme';

/**
 * Categories (roadmap D39): rename, add and hide, opened from You as a
 * full-height sheet like How scoring works.
 */
export default function CategoriesScreen() {
  const router = useRouter();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/you' as never);
  };
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <CloseButton onPress={close} testID="categories-close" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <CategoryManager />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
});
