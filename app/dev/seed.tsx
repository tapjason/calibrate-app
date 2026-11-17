import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/constants/theme';
import { loadPlaytestProfile } from '@/dev/loadProfile';
import { PLAYTEST_PROFILES, type ProfileId } from '@/dev/playtestProfiles';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';

/**
 * Development only: loads the demo predictions for store screenshots
 * (APP_STORE_LISTING.md §5). Open /dev/seed on the web build or a dev
 * client. In a release build this route just redirects home.
 *
 * Below it, the playtest profiles (docs/app-profile.md §9): named start states
 * that replace this device's data, so a web playtest and the owner's iPhone
 * can start from the same record. A profile takes two taps, the first arming
 * it, since it erases whatever is there.
 */
export default function DevSeedScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<ProfileId | null>(null);
  // Said under the profile last tapped, so it's in view near the bottom.
  const [profileStatus, setProfileStatus] = useState<{ id: ProfileId; text: string } | null>(
    null,
  );
  const [loading, setLoading] = useState<ProfileId | null>(null);

  if (!__DEV__) return <Redirect href="/" />;

  const load = async () => {
    setBusy(true);
    try {
      const added = await usePredictionStore.getState().loadDemoData();
      setStatus(added ? 'Demo data loaded.' : 'Demo data was already loaded.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const say = (id: ProfileId, text: string) => {
    setProfileStatus({ id, text });
    AccessibilityInfo.announceForAccessibility(text);
  };

  const loadProfile = async (id: ProfileId) => {
    if (armed !== id) {
      setArmed(id);
      say(id, 'Tap it again to replace everything on this device with this profile.');
      return;
    }
    setArmed(null);
    setBusy(true);
    setLoading(id);
    try {
      const n = await loadPlaytestProfile(id);
      say(id, `Profile "${id}" loaded: ${n} predictions.`);
    } catch (e) {
      say(id, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Demo data</Text>
        <Text style={styles.body}>
          Adds about 153 resolved and 7 open predictions to this device, for
          screenshots. Development builds only.
        </Text>
        <Button
          label={busy && loading === null ? 'Loading…' : 'Load demo data'}
          onPress={() => void load()}
          disabled={busy}
          testID="dev-seed-load"
        />
        {status && (
          <Text style={styles.body} testID="dev-seed-status">
            {status}
          </Text>
        )}
        {/* In memory only: nothing is written to the entitlement mirror, so a
            reload (or the next billing refresh) puts the device back to free.
            For screenshots of the Plus surfaces, never a way to unlock them. */}
        <Button
          label="Preview Plus until reload"
          variant="secondary"
          onPress={() => {
            useEntitlementStore.setState({
              entitlement: { is_plus: true, source: 'annual', expires_at: null },
              isPlus: true,
            });
            setStatus('Plus previewed in memory. Reload to end it.');
          }}
          testID="dev-seed-plus"
        />
        <Button
          label="Go to Today"
          variant="secondary"
          onPress={() => router.replace('/' as never)}
          testID="dev-seed-home"
        />
        <Text style={styles.title}>Playtest profiles</Text>
        <Text style={styles.body}>
          Each replaces all data on this device (as Erase all data does), finishes
          the Warm-up, then loads its record. Guest only. Open ones get reminders
          as usual. Erase all data before signing in with a real account: signing
          in moves this device&apos;s predictions into the account and uploads them.
        </Text>
        {PLAYTEST_PROFILES.map((p) => (
          <View key={p.id} style={styles.profile}>
            <Button
              label={
                loading === p.id
                  ? 'Loading…'
                  : armed === p.id
                    ? `Replace with "${p.label}"`
                    : p.label
              }
              variant={armed === p.id ? 'primary' : 'secondary'}
              onPress={() => void loadProfile(p.id)}
              disabled={busy}
              testID={`dev-seed-profile-${p.id}`}
            />
            {profileStatus?.id === p.id && (
              <Text style={styles.body} testID="dev-seed-profile-status">
                {profileStatus.text}
              </Text>
            )}
            <Text style={styles.note}>
              {p.summary} For: {p.personas.join(', ')}.
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  wrap: { gap: space.md, padding: space.lg },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  profile: { gap: space.xs },
  note: { ...type.footnote, color: colors.textSecondary },
});
