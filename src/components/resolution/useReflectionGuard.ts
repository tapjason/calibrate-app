import { usePreventRemove } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
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
 *
 * Web has two more ways out that prevent-remove never sees (roadmap step 23):
 * the browser's own Back, which just unmounts the screen, so an unsaved draft
 * is saved on unmount; and a reload or tab close, which the page asks about
 * while a draft is unsaved.
 */
export function useReflectionGuard(predictionId: string, draft: string) {
  const navigation = useNavigation();
  const leaving = useRef(false);
  const unsaved = draft.trim().length > 0;

  // The latest values, for the unmount cleanup below.
  const latest = useRef({ predictionId, draft });
  latest.current = { predictionId, draft };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return () => {
      const { predictionId: id, draft: text } = latest.current;
      if (leaving.current || text.trim().length === 0 || !id) return;
      leaving.current = true;
      void usePredictionStore
        .getState()
        .reflect(id, text)
        .catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !unsaved) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome still needs returnValue set to show its own prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [unsaved]);

  usePreventRemove(unsaved, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (leaving.current) {
      leave();
      return;
    }
    const saveAndLeave = async () => {
      try {
        await usePredictionStore.getState().reflect(predictionId, draft);
        // Saved: the web unmount save mustn't write it a second time.
        leaving.current = true;
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
