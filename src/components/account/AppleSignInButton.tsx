import { Platform, StyleSheet } from 'react-native';

/**
 * Apple's own Sign in with Apple button. Apple's guidelines require the
 * system-provided button (or one that matches it exactly), so this wraps
 * `AppleAuthenticationButton` rather than styling our own.
 *
 * iOS only; renders nothing elsewhere. The native module is required lazily
 * so Android, web and Jest never load it.
 */
export function AppleSignInButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  if (Platform.OS !== 'ios') return null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');

  return (
    <AppleAuthentication.AppleAuthenticationButton
      testID="account-apple"
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={8}
      style={[styles.button, disabled && styles.disabled]}
      onPress={disabled ? () => {} : onPress}
    />
  );
}

const styles = StyleSheet.create({
  button: { height: 48, width: '100%' },
  disabled: { opacity: 0.4 },
});
