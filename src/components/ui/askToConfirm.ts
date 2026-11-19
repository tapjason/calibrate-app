import { Alert, Platform } from 'react-native';

/**
 * Asks once more before something that can't be undone: a system alert on
 * the phone, with Cancel and the destructive choice; on web, where
 * react-native-web's Alert.alert does nothing, the browser's own confirm, so
 * the web build the playtests use can still get through.
 *
 * `onYes` runs from the destructive button. iOS draws a system alert in a
 * window above the app lock, so `onYes` must check `appLocked()` itself, at
 * the press (src/components/ui/appLocked.ts).
 */
export function askToConfirm(
  title: string,
  message: string,
  destructiveLabel: string,
  onYes: () => void,
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructiveLabel, style: 'destructive', onPress: onYes },
  ]);
}
