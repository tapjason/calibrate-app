import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { chosenProps } from '@/components/ui/chosen';
import { TextButton } from '@/components/ui/TextButton';
import { TextField } from '@/components/ui/TextField';
import { PRIVACY_POLICY_URL } from '@/constants/app';
import { colors, elevation, radius, space, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PasswordChecklist } from './PasswordChecklist';

type Mode = 'signIn' | 'signUp';

const MODES: ReadonlyArray<{ key: Mode; label: string }> = [
  { key: 'signIn', label: 'Sign in' },
  { key: 'signUp', label: 'Create account' },
];

/**
 * Past this "Create account" can't wrap between its two words in half the
 * form at 320 pt, and would break inside one (Share's tabs stop at the same).
 */
const MODE_MAX_SCALE = 1.6;

/** What signing in sends besides the predictions, in You's own words for it. */
export const USAGE_NOTE =
  'Once you’re signed in, a record of which features you use, including what’s already on this phone, is sent with your account: numbers, yes/no values and fixed labels such as which screen, never the words of your predictions or notes. You can turn that off in You, under Usage stats.';

/**
 * Sign in or create an account (docs/ACCOUNT_SPEC.md §1).
 *
 * Optional by design: nothing in the core loop routes here. People arrive from
 * Settings or from the Coach, which runs on the server and so needs to know who
 * is asking.
 *
 * One form for both. A two-segment switch above the email field, "Sign in" and
 * "Create account", picks which (owner, 2026-11-17: the text link at the
 * bottom it replaced changed only the words, so the switch was hard to see).
 * Create account also lists the password's rules under its field, each met or
 * not as it's typed (step 190); a password that misses one is refused on
 * submit with what's missing, as a short one was before. Sign in has no rules,
 * so an account made before them still signs in. Sign in with Apple sits above
 * the switch, since it works for both, and "Continue with Google" under it
 * (step 192; iOS only, and only while GOOGLE_SIGN_IN_ENABLED is on), Apple's
 * first.
 *
 * On success this only calls `onDone`. The session reaches the app through
 * authStore's onAuthStateChange, which moves the guest's predictions into the
 * account, reloads the stores and starts the first sync. Doing any of that
 * here would do it twice.
 */
export function SignInView({ onDone }: { onDone: () => void }) {
  const pending = useAuthStore((s) => s.pending);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  // Usage stats are on unless the person turned them off, and from sign-in
  // they go up with the account: said here, before the account exists
  // (guideline 5.1.1(ii); policy audit, 2026-11-14).
  const usageStatsOn = useSettingsStore((s) => s.analyticsEnabled);
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Shown under the fields and said aloud, as Log and the category chips say
  // theirs: `accessibilityRole="alert"` adds no trait on iOS and posts
  // nothing, so VoiceOver never heard a refusal, and since step 190's
  // password rules one is routine (security review, 2026-11-18).
  const fail = (message: string) => {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const onApple = async () => {
    setError(null);
    const outcome = await signInWithApple();
    if (outcome.ok) onDone();
    else fail(outcome.error);
  };

  // The same path as Apple's: the session arrives through onAuthStateChange.
  const onGoogle = async () => {
    setError(null);
    const outcome = await signInWithGoogle();
    if (outcome.ok) onDone();
    else fail(outcome.error);
  };

  const onSubmit = async () => {
    setError(null);
    setNotice(null);
    if (mode === 'signIn') {
      const outcome = await signInWithEmail(email, password);
      if (outcome.ok) onDone();
      else fail(outcome.error);
      return;
    }
    const outcome = await signUpWithEmail(email, password);
    if (!outcome.ok) {
      fail(outcome.error);
    } else if (outcome.needsConfirmation) {
      // The account exists but has no session until the email link is
      // clicked. Leave the form in sign-in mode, email filled, for when they
      // come back.
      setMode('signIn');
      setPassword('');
      setNotice(`Check ${email.trim()} for a confirmation link, then sign in here.`);
    } else {
      onDone();
    }
  };

  // A tap on the side already chosen changes nothing, so it can't clear the
  // confirmation notice that says to sign in here.
  const chooseMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setNotice(null);
  };

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>
        {mode === 'signIn' ? 'Sign in' : 'Create an account'}
      </Text>
      <Text style={styles.lede}>
        Back up your predictions and use Coach. Everything already on this phone
        moves into your account, notes included, so another phone can restore it.
        We don't read or share it.
      </Text>
      {usageStatsOn && (
        <Text style={styles.lede} testID="account-usage-note">
          {USAGE_NOTE}
        </Text>
      )}
      {PRIVACY_POLICY_URL && (
        <TextButton
          label="Privacy policy"
          onPress={() => {
            openBrowserAsync(PRIVACY_POLICY_URL as string).catch((e: unknown) => {
              // eslint-disable-next-line no-console
              console.warn('[account] could not open link:', e);
            });
          }}
          testID="account-privacy-link"
        />
      )}

      <AppleSignInButton onPress={() => void onApple()} disabled={pending} />
      <GoogleSignInButton onPress={() => void onGoogle()} disabled={pending} />

      <ModeSwitch mode={mode} onChoose={chooseMode} />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        testID="account-email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        testID="account-password"
      >
        {mode === 'signUp' && <PasswordChecklist password={password} />}
      </TextField>

      {error && (
        <Text style={styles.error} testID="account-error" accessibilityRole="alert">
          {error}
        </Text>
      )}
      {notice && (
        <Text style={styles.notice} testID="account-notice">
          {notice}
        </Text>
      )}

      <Button
        label={
          pending ? 'One moment…' : mode === 'signIn' ? 'Sign in' : 'Create account'
        }
        disabled={pending}
        onPress={() => void onSubmit()}
        testID="account-submit"
      />
    </View>
  );
}

/**
 * Sign in or Create account, two equal segments the width of the form, drawn
 * the way iOS draws a segmented control: the chosen one raised, a card-coloured
 * segment with an outline, and set bolder; the other flat, in quieter text. So
 * the choice never rests on colour alone (DESIGN_SYSTEM §0.5), and the submit
 * button stays the only ink fill on the screen: an ink "Create account" segment
 * above an ink "Create account" button read as two buttons (2026-11-17).
 *
 * The outline carries the raised look: `surface` and `surfaceSunken` are about
 * 1.2:1 apart in light and 1.1:1 in dark, where `surface` is the darker one.
 */
function ModeSwitch({ mode, onChoose }: { mode: Mode; onChoose: (next: Mode) => void }) {
  return (
    <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Account">
      {MODES.map((m) => {
        const chosen = mode === m.key;
        return (
          <Pressable
            key={m.key}
            testID={`account-mode-${m.key}`}
            accessibilityRole="radio"
            {...chosenProps('radio', chosen)}
            onPress={() => onChoose(m.key)}
            style={[styles.mode, chosen && styles.modeChosen]}
          >
            <Text
              style={[styles.modeLabel, chosen && styles.modeLabelChosen]}
              maxFontSizeMultiplier={MODE_MAX_SCALE}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, padding: space.xxl },
  title: { ...type.title2, color: colors.textPrimary },
  lede: { ...type.subhead, color: colors.textSecondary, marginBottom: space.sm },
  modes: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
  },
  mode: {
    alignItems: 'center',
    // Both segments have the border, clear on the unchosen one, so choosing
    // doesn't move a label by a point.
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  // Raised: the card colour, an outline and the cards' shadow. The outline
  // meets the sunken track, where the fields' controlBorder is 2.93:1 in
  // light, under the 3:1 a control's edge needs; textTertiary is 4.66:1 there
  // (4.92:1 in dark) and 5.57:1 on the segment's own surface (step 195).
  modeChosen: {
    ...elevation.e1,
    backgroundColor: colors.surface,
    borderColor: colors.textTertiary,
  },
  // Stretched to the segment, so a label that wraps at a large text size
  // wraps inside it (Share's tabs, playtest 2026-11-03).
  modeLabel: {
    ...type.subhead,
    alignSelf: 'stretch',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modeLabelChosen: { color: colors.textPrimary, fontWeight: '600' },
  error: { ...type.subhead, color: colors.destructive },
  notice: { ...type.subhead, color: colors.actionText },
});
