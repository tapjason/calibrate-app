import { usePreventRemove } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useRef } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export const LOG_GUARD_OPTIONS = ['Discard prediction', 'Keep editing'] as const;

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
        { options: [...LOG_GUARD_OPTIONS], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (index) => {
          if (index === 0) leave();
        },
      );
      return;
    }
    Alert.alert('Discard this prediction?', undefined, [
      { text: LOG_GUARD_OPTIONS[1], style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  });

  return {
    markLeaving: () => {
      leaving.current = true;
    },
  };
}
