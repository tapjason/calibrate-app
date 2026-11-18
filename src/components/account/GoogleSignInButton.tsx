import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GOOGLE_SIGN_IN_ENABLED } from '@/constants/app';
import { colors } from '@/constants/theme';

/** One of the three labels Google's branding guidelines approve. */
export const GOOGLE_BUTTON_LABEL = 'Continue with Google';

/**
 * Google's four-colour "G", path for path from Google's own button artwork:
 * https://developers.google.com/static/identity/images/branding_guideline_sample_lt_rd_sl.svg
 * (the dark sample, `…_dk_rd_sl.svg`, draws the same four paths), linked from
 * https://developers.google.com/identity/branding-guidelines (fetched
 * 2026-11-18). The mark sits in a 20 × 20 box at (10, 10) of that file's
 * 40 × 40 view box, so `viewBox` below crops to it and the paths stay
 * unchanged. Never recoloured, never monochrome: the guidelines forbid both.
 */
const G_VIEW_BOX = '10 10 20 20';
const G_PATHS = [
  {
    d: 'M29.6 20.2273C29.6 19.5182 29.5364 18.8364 29.4182 18.1818H20V22.05H25.3818C25.15 23.3 24.4455 24.3591 23.3864 25.0682V27.5773H26.6182C28.5091 25.8364 29.6 23.2727 29.6 20.2273Z',
    fill: colors.googleBlue,
  },
  {
    d: 'M20 30C22.7 30 24.9636 29.1045 26.6181 27.5773L23.3863 25.0682C22.4909 25.6682 21.3454 26.0227 20 26.0227C17.3954 26.0227 15.1909 24.2636 14.4045 21.9H11.0636V24.4909C12.7091 27.7591 16.0909 30 20 30Z',
    fill: colors.googleGreen,
  },
  {
    d: 'M14.4045 21.9C14.2045 21.3 14.0909 20.6591 14.0909 20C14.0909 19.3409 14.2045 18.7 14.4045 18.1V15.5091H11.0636C10.3864 16.8591 10 18.3864 10 20C10 21.6136 10.3864 23.1409 11.0636 24.4909L14.4045 21.9Z',
    fill: colors.googleYellow,
  },
  {
    d: 'M20 13.9773C21.4681 13.9773 22.7863 14.4818 23.8227 15.4727L26.6909 12.6045C24.9591 10.9909 22.6954 10 20 10C16.0909 10 12.7091 12.2409 11.0636 15.5091L14.4045 18.1C15.1909 15.7364 17.3954 13.9773 20 13.9773Z',
    fill: colors.googleRed,
  },
] as const;

/** Google's iOS spec: a 20 pt G, 12 pt before the label, 16 pt at each end. */
const G_SIZE = 20;

/**
 * "Continue with Google" (step 192), the sign-in screen's second button,
 * under Sign in with Apple and the same footprint: full width, 48 pt high,
 * corner radius 8. Apple's button stays first and at least as prominent.
 *
 * Google's branding guidelines bind it: the standard four-colour G (never
 * monochrome), Google's Light theme in light appearance and its Dark theme in
 * dark (tokens `googleButton*` in src/constants/theme.ts), an approved label.
 * The label is in the system font, as Apple's button beside it is, rather than
 * the app's Instrument Sans, at about the size Apple's button draws its text
 * at this height.
 *
 * Renders nothing unless `GOOGLE_SIGN_IN_ENABLED` is on and this is iOS: the
 * web build's redirect can't use the app's scheme, and the flag waits for the
 * owner's Google Cloud and Supabase set-up.
 */
export function GoogleSignInButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  if (!GOOGLE_SIGN_IN_ENABLED || Platform.OS !== 'ios') return null;

  return (
    <Pressable
      testID="account-google"
      accessibilityRole="button"
      accessibilityLabel={GOOGLE_BUTTON_LABEL}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Svg width={G_SIZE} height={G_SIZE} viewBox={G_VIEW_BOX} testID="account-google-mark">
        {G_PATHS.map((path) => (
          <Path key={path.d} d={path.d} fill={path.fill} />
        ))}
      </Svg>
      <Text style={styles.label} maxFontSizeMultiplier={1.3}>
        {GOOGLE_BUTTON_LABEL}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.googleButtonFill,
    borderColor: colors.googleButtonStroke,
    // Apple's button beside it (AppleSignInButton) is drawn at 8.
    borderRadius: 8,
    // Google's 1 pt stroke, inside the edge as React Native draws borders.
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: '100%',
  },
  pressed: { backgroundColor: colors.googleButtonPressed },
  // As Apple's button while something is in flight.
  disabled: { opacity: 0.4 },
  // No fontFamily: the system font (San Francisco on iOS). A large text size
  // wraps the label inside the button rather than past its edge.
  label: {
    color: colors.googleButtonText,
    flexShrink: 1,
    fontSize: 19,
    fontWeight: '500',
    lineHeight: 24,
    textAlign: 'center',
  },
});
