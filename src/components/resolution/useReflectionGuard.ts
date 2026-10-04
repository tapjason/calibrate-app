import { usePreventRemove } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useRef } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { usePredictionStore } from '@/store/predictionStore';

export const GUARD_OPTIONS = ['Save reflection', 'Discard reflection', 'Keep editing'] as const;

/**
 * Asks before a typed reflection is thrown away (DESIGN_SYSTEM §7.7, HIG
 * sheets: confirm before dismissing unsaved changes). The answer itself is
 * already recorded by then; only the reflection is at stake, so the first
 * choice saves it rather than making the user go back and tap Done.
 *
 * Covers the swipe-down on the Resolve sheet and any other way out:
 * native-stack keeps a prevented sheet open and hands the dismissal here.
 * The web build has no action sheet (react-native-web's Alert is a no-op),
 * so there the reflection is simply saved.
 *
 * Call `markLeaving()` before navigating away on purpose (Done, Skip), so
 * the guard lets that exit through.
 */
export function useReflectionGuard(predictionId: string, draft: string) {
  const navigation = useNavigation();
  const leaving = useRef(false);
  const unsaved = draft.trim().length > 0;

  usePreventRemove(unsaved, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (leaving.current) {
      leave();
      return;
    }
    const saveAndLeave = async () => {
      try {
        await usePredictionStore.getState().reflect(predictionId, draft);
        leave();
      } catch {
        // Stay put: Done is still on screen and reports the error itself.
      }
    };

    if (Platform.OS === 'web') {
      void saveAndLeave();
      return;
    }
    const choose = (index: number) => {
      if (index === 0) void saveAndLeave();
      else if (index === 1) leave();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...GUARD_OPTIONS],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        choose,
      );
      return;
    }
    Alert.alert('Save your reflection?', undefined, [
      { text: GUARD_OPTIONS[2], style: 'cancel', onPress: () => choose(2) },
      { text: 'Discard', style: 'destructive', onPress: () => choose(1) },
      { text: 'Save', onPress: () => choose(0) },
    ]);
  });

  return {
    markLeaving: () => {
      leaving.current = true;
    },
  };
}
