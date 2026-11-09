import { usePreventRemove } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useRef } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export const LOG_GUARD_OPTIONS = ['Discard prediction', 'Keep editing'] as const;
/** An open prediction's Edit (playtest 2026-11-08b, finding 20). */
export const EDIT_GUARD_OPTIONS = ['Discard changes', 'Keep editing'] as const;

interface GuardWords {
  /** The destructive choice first, then the way back. */
  options: readonly [string, string];
  /** The alert's title where there is no action sheet (not iOS or web). */
  title: string;
}

const LOG_WORDS: GuardWords = { options: LOG_GUARD_OPTIONS, title: 'Discard this prediction?' };
const EDIT_WORDS: GuardWords = { options: EDIT_GUARD_OPTIONS, title: 'Discard these changes?' };

/**
 * Asks before a typed, unsaved prediction is thrown away (DESIGN_SYSTEM §7.7,
 * HIG Sheets: "If people have unsaved changes in the sheet when they begin
 * swiping to dismiss it, use an action sheet to let them confirm"). Log is a
 * sheet since roadmap D3; as a tab it kept its draft, as a sheet a swipe or
 * the × would drop it.
 *
 * Native-stack keeps a prevented sheet open and hands the dismissal here. The
 * web build has no action sheet (react-native-web's Alert is a no-op), so
 * there the sheet simply closes.
 *
 * Call `markLeaving()` before closing on purpose (after Save), so the guard
 * lets that exit through.
 */
export function useLogDraftGuard(unsaved: boolean) {
  return useDraftGuard(unsaved, LOG_WORDS);
}

/**
 * The same guard for an open prediction's Edit: a swipe on its sheet dropped
 * a changed title or date without a word, where Log asks.
 */
export function useEditDraftGuard(unsaved: boolean) {
  return useDraftGuard(unsaved, EDIT_WORDS);
}

function useDraftGuard(unsaved: boolean, words: GuardWords) {
  const navigation = useNavigation();
  const leaving = useRef(false);

  usePreventRemove(unsaved, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (leaving.current || Platform.OS === 'web') {
      leave();
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...words.options], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (index) => {
          if (index === 0) leave();
        },
      );
      return;
    }
    Alert.alert(words.title, undefined, [
      { text: words.options[1], style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  });

  return {
    markLeaving: () => {
      leaving.current = true;
    },
  };
}
