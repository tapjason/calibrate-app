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
    // The practice sheet's shape (app/practice.tsx): the scroll view is the
    // only child, and the × scrolls inside it. react-native-screens on the New
    // Architecture resizes a formSheet's scroll view to the whole sheet and can
    // lay it at the top, over a header beside it (docs/app-profile.md §18): on
    // the practice sheet the content sat on the title and the × couldn't be
    // tapped (owner, 2026-11-21).
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        testID="categories-scroll"
      >
        <View style={styles.top}>
          <CloseButton onPress={close} testID="categories-close" />
        </View>
        <CategoryManager />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { alignItems: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.md },
});
