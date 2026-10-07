import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

import { AppleSignInButton } from './AppleSignInButton';

type Mode = 'signIn' | 'signUp';

/**
 * Sign in or create an account (docs/ACCOUNT_SPEC.md §1).
 *
 * Optional by design: nothing in the core loop routes here. People arrive from
 * Settings or from the Coach, which runs on the server and so needs to know who
 * is asking.
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

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onApple = async () => {
    setError(null);
    const outcome = await signInWithApple();
    if (outcome.ok) onDone();
    else setError(outcome.error);
  };

  const onSubmit = async () => {
    setError(null);
    setNotice(null);
    if (mode === 'signIn') {
      const outcome = await signInWithEmail(email, password);
      if (outcome.ok) onDone();
      else setError(outcome.error);
      return;
    }
    const outcome = await signUpWithEmail(email, password);
    if (!outcome.ok) {
      setError(outcome.error);
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

  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setError(null);
    setNotice(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        {mode === 'signIn' ? 'Sign in' : 'Create an account'}
      </Text>
      <Text style={styles.lede}>
        Back up your predictions and use Coach. Everything already on this phone
        moves into your account.
      </Text>

      <AppleSignInButton onPress={() => void onApple()} disabled={pending} />

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
      />

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

      <Pressable
        onPress={switchMode}
        accessibilityRole="button"
        testID="account-switch-mode"
        style={styles.switch}
      >
        <Text style={styles.switchText}>
          {mode === 'signIn'
            ? 'New here? Create an account'
            : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, padding: 24 },
  title: { ...type.title2, color: colors.textPrimary },
  lede: { ...type.subhead, color: colors.textSecondary, marginBottom: 8 },
  error: { ...type.subhead, color: colors.destructive },
  notice: { ...type.subhead, color: colors.brandText },
  switch: { alignItems: 'center', paddingVertical: 12 },
  switchText: { ...type.subhead, color: colors.brandText, fontWeight: '500' },
});
