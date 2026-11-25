import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import {
  LOCAL_ONLY_FROZEN_FOOTER,
  LOCAL_ONLY_GUEST_FOOTER,
  LOCAL_ONLY_GUEST_ROW,
  LOCAL_ONLY_GUEST_WHERE,
} from '@/components/age/localOnlyCopy';
import { appLocked } from '@/components/ui/appLocked';
import { askToConfirm } from '@/components/ui/askToConfirm';
import { localCount } from '@/components/ui/count';
import { endSentence } from '@/components/ui/sentence';
import { Icon } from '@/components/ui/Icon';
import { OptionChip } from '@/components/ui/OptionChip';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  APP_NAME,
  APP_VERSION,
  PLUS_NAME,
  PRIVACY_POLICY_URL,
  REFINE_ENABLED,
  SUPPORT_URL,
  TERMS_OF_USE_URL,
} from '@/constants/app';
import { colors, radius, space, type } from '@/constants/theme';
import { DAY_NAMES, DayChips } from '@/components/settings/DayChips';
import { TimeSetting } from '@/components/settings/TimeSetting';
import { useCsvExport } from '@/components/settings/useCsvExport';
import {
  lockMethod,
  lockSupport,
  passcodeSettingsPage,
  type LockMethod,
  type LockSupport,
} from '@/lock/appLock';
import {
  askForReminders,
  reminderPermission,
  type ReminderPermission,
} from '@/notifications/permission';
import { reminderTimeLabel } from '@/notifications/copy';
import { useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useLockStore } from '@/store/lockStore';
import { selectUsageStatsOn, useSettingsStore } from '@/store/settingsStore';
import { isLockGraceMinutes, LOCK_GRACE_MINUTES, type LockGraceMinutes } from '@/types';

/**
 * The You tab (roadmap D3): settings as a grouped inset list (DESIGN_SYSTEM
 * §7.21, roadmap step 80), as iOS Settings, Streaks and Todoist lay theirs
 * out. A row that opens something is the whole row, with a chevron and its
 * current value; an on/off row ends in a switch; nothing hides its target in
 * a capsule button inside the row.
 *
 *   - Account: sign in, or who you are and sign out. Hidden on a build with no
 *     Supabase config, where accounts can't exist.
 *   - Your card, then Plus (also the permanent route to Restore).
 *   - Notifications: the single kill-switch for reminders and the digest.
 *   - AI Refine (hidden while REFINE_ENABLED is false), Coach, usage stats.
 *   - About: how scoring works, terms, privacy.
 *   - Erase all data / Delete account, alone at the bottom.
 *
 * Under the under-13 rule (roadmap D70; docs/design/research/
 * under-13-2026-11.md, "Screens"): the account group explains why everything
 * stays on this phone (a guest) or that backup is off (an account signed in
 * before, frozen: Sign out and Delete account stay), and the Plus row, Coach
 * and Usage stats (with the dormant AI Refine) are gone, since none of them
 * can do anything here.
 * Everything else, Export included, is as usual.
 *
 * Pure presentation: reads + writes the store, no other logic. The setters
 * persist and swallow their own errors.
 */
export function SettingsView({
  onOpenPaywall,
  onOpenAccount,
  onOpenDelete,
  onOpenScoring,
  onOpenCard,
  onOpenCategories,
}: {
  onOpenPaywall?: () => void;
  onOpenAccount?: () => void;
  onOpenDelete?: () => void;
  /** "How scoring works" (roadmap step 29). */
  onOpenScoring?: () => void;
  /** The share card (Share), one tap from the tab named after you. */
  onOpenCard?: () => void;
  /** Rename, add or hide categories (roadmap D39), and give them icons (D40). */
  onOpenCategories?: () => void;
} = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const aiRefineEnabled = useSettingsStore((s) => s.aiRefineEnabled);
  const setNotificationsEnabled = useSettingsStore(
    (s) => s.setNotificationsEnabled,
  );
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const setRemindersEnabled = useSettingsStore((s) => s.setRemindersEnabled);
  const digestEnabled = useSettingsStore((s) => s.digestEnabled);
  const setDigestEnabled = useSettingsStore((s) => s.setDigestEnabled);
  // Their times (roadmap D38).
  const dueReminderTime = useSettingsStore((s) => s.dueReminderTime);
  const setDueReminderTime = useSettingsStore((s) => s.setDueReminderTime);
  const digestDay = useSettingsStore((s) => s.digestDay);
  const setDigestDay = useSettingsStore((s) => s.setDigestDay);
  const digestTime = useSettingsStore((s) => s.digestTime);
  const setDigestTime = useSettingsStore((s) => s.setDigestTime);
  const setAiRefineEnabled = useSettingsStore((s) => s.setAiRefineEnabled);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const setCoachEnabled = useSettingsStore((s) => s.setCoachEnabled);
  // Usage stats as the one read of the setting says: off by default on a
  // phone whose region is Canada, until the person turns them on.
  const usageStatsOn = useSettingsStore(selectUsageStatsOn);
  const setAnalyticsEnabled = useSettingsStore((s) => s.setAnalyticsEnabled);
  const streakShown = useSettingsStore((s) => s.streakShown);
  const setStreakShown = useSettingsStore((s) => s.setStreakShown);
  // The under-13 rule (D70): no Plus, no Coach, no usage counts on this phone.
  const localOnly = useAgeStore((s) => s.localOnly);
  const showPlus = !!onOpenPaywall && !localOnly;

  return (
    <View style={styles.wrap}>
      <AccountGroup onOpenAccount={onOpenAccount} />

      {/*
        Plus sits high because it is also where a subscriber goes to restore a
        purchase after a reinstall: the paywall carries Restore, and this is
        the only permanent route to it for someone who has already paid.
        Under the under-13 rule only Your card is left, with no footer: Plus's
        line would offer what isn't offered here.
      */}
      {(onOpenCard || showPlus) && (
        <Group
          footer={
            !showPlus
              ? undefined
              : isPlus
                ? 'Active. Coach and Trends are unlocked.'
                : 'Plus adds Coach, Trends and extra card themes. Your score, curve, badges and cards stay free.'
          }
        >
          {onOpenCard && <NavRow label="Your card" onPress={onOpenCard} testID="settings-card" />}
          {showPlus && onOpenPaywall && (
            <NavRow
              label={PLUS_NAME}
              value={isPlus ? 'Active' : undefined}
              onPress={onOpenPaywall}
              testID="settings-plus"
            />
          )}
        </Group>
      )}

      {/* The person's own categories (roadmap D39). */}
      {onOpenCategories && (
        <Group footer="Rename, add, hide or give an icon to the categories you log under.">
          <NavRow label="Categories" onPress={onOpenCategories} testID="settings-categories" />
        </Group>
      )}

      {/* A way out of the streak's pressure (step 173, aggregate B5): several
          testers would have left over it. Nothing in the record depends on it. */}
      <Group>
        <ToggleRow
          label="Streak and daily goal"
          description="Days in a row with a prediction logged or answered, and the goal of three a day. Off hides them; your predictions and scores are the same either way."
          value={streakShown}
          onValueChange={(v) => void setStreakShown(v)}
          testID="toggle-streak"
        />
        <AppLockRow />
      </Group>

      <Group>
        <ToggleRow
          label="Notifications"
          description={`Everything ${APP_NAME} sends. Each kind has its own choice below.`}
          value={notificationsEnabled}
          onValueChange={(v) => void setNotificationsEnabled(v)}
          testID="toggle-notifications"
        />
        {/* One switch each under the main one (roadmap D31): a tester wanted
            the reminders without the digest. Shown while the main one is on. */}
        {notificationsEnabled && (
          <>
            <ToggleRow
              label="Due-day reminders"
              // The time only while it's on: off, a time read as still coming
              // (blind playtest 2026-11-13, run 7).
              // What one shows, since nothing else in You says (four testers
              // over rounds 18–19 asked what the lock screen would show; the
              // words switch that said it went on 2026-11-25).
              description={`${
                remindersEnabled
                  ? endSentence(`On the day each prediction comes due, at ${reminderTimeLabel(dueReminderTime)}`)
                  : 'On the day each prediction comes due.'
              } ${REMINDER_SHOWS}`}
              value={remindersEnabled}
              onValueChange={(v) => void setRemindersEnabled(v)}
              testID="toggle-reminders"
            />
            {/* Their own times (roadmap D38): four testers wanted them. */}
            {remindersEnabled && (
              <View style={styles.stacked} testID="settings-reminder-time">
                <TimeSetting
                  label="Reminder time"
                  value={dueReminderTime}
                  onChange={(t) => void setDueReminderTime(t)}
                  testID="reminder-time"
                />
              </View>
            )}
            <ToggleRow
              label="Weekly digest"
              description={
                digestEnabled
                  ? endSentence(
                      `How many are open, never their words, ${DAY_NAMES[digestDay]} at ${reminderTimeLabel(digestTime)}`,
                    )
                  : 'How many are open, never their words, once a week.'
              }
              value={digestEnabled}
              onValueChange={(v) => void setDigestEnabled(v)}
              testID="toggle-digest"
            />
            {digestEnabled && (
              <View style={styles.stacked} testID="settings-digest-when">
                <DayChips
                  value={digestDay}
                  onChange={(d) => void setDigestDay(d)}
                  testID="digest-day"
                />
                <TimeSetting
                  label="Digest time"
                  value={digestTime}
                  onChange={(t) => void setDigestTime(t)}
                  testID="digest-time"
                />
              </View>
            )}
          </>
        )}
        <NotificationPermissionRow />
      </Group>

      {/* Under the under-13 rule the whole group goes (D70): none of AI
          Refine, Coach and Usage stats can send anything here, and the
          account group says why. The stored choices are left untouched. */}
      {!localOnly && (
        <Group>
          {/* Hidden while refine is cut from the release — a toggle for a button
              that doesn't exist is worse than no toggle. The stored preference is
              left untouched, so flipping REFINE_ENABLED back on restores whatever
              the user had chosen. */}
          {REFINE_ENABLED && (
            <ToggleRow
              label="AI Refine"
              description="Show the ✨ Refine button to rewrite predictions for a clear yes/no."
              value={aiRefineEnabled}
              onValueChange={(v) => void setAiRefineEnabled(v)}
              testID="toggle-ai-refine"
            />
          )}
          <ToggleRow
            label="Coach (AI)"
            // Guideline 5.1.2(i): say that a third-party AI service writes the
            // feedback before anything is sent.
            // The switch itself is the explicit permission; it starts off.
            // Without Plus the switch only records the choice, and once it was
            // on nothing happened, which read as broken (blind playtest
            // 2026-11-01); on, it says it waits for Plus.
            description={`${
              isPlus
                ? ''
                : coachEnabled
                  ? 'On for when you have Plus. Nothing is sent before then. '
                  : 'Plus only. '
            }When you ask for feedback, your calibration numbers — never your prediction text — go through our server to a third-party AI service, which writes it.`}
            value={coachEnabled}
            onValueChange={(v) => void setCoachEnabled(v)}
            testID="toggle-coach"
          />
          <ToggleRow
            // Not "anonymous": once you sign in, events are tied to the account
            // (APP_PRIVACY.md declares them linked), so the label mustn't say so.
            label="Usage stats"
            description={USAGE_STATS_DESCRIPTION}
            value={usageStatsOn}
            onValueChange={(v) => void setAnalyticsEnabled(v)}
            testID="toggle-analytics"
          />
        </Group>
      )}

      <DataGroup />

      <AboutGroup onOpenScoring={onOpenScoring} />

      {onOpenDelete && <DeleteGroup onOpenDelete={onOpenDelete} />}
    </View>
  );
}

/**
 * What every due-day reminder shows (2026-11-25: always without the words,
 * with no Happened / Didn't; the switch that showed them is gone). Exported
 * for tests.
 */
export const REMINDER_SHOWS = 'Each shows your number and the day you made it, never its words.';

/**
 * The lock switch's name: only a way of unlocking this phone has, and has in
 * use (HIG). "iPhone passcode", so it can't read as a code of the app's own.
 */
export function appLockLabel(method: LockMethod): string {
  return method === 'your passcode' ? 'Lock with iPhone passcode' : `Lock with ${method}`;
}

/** Said under the switch, and aloud, when a check didn't pass. */
export const APP_LOCK_FAILED = 'That didn’t go through, so nothing changed.';

/**
 * "Lock after" as the lock store reads it (D75): a value that isn't one of
 * the choices is Immediately, the side that locks.
 */
function graceOf(minutes: LockGraceMinutes): LockGraceMinutes {
  return isLockGraceMinutes(minutes) ? minutes : 0;
}

/** Holds a count to its unit, so "15 minutes" never breaks at 320pt (§8). */
const NBSP = ' ';

/**
 * A "Lock after" choice in words (roadmap D75), as its chip shows it and the
 * lines use it: "Immediately", "1 minute", "5 minutes", "15 minutes", each
 * count held to its unit by a no-break space. Exported for tests.
 */
export function lockAfterLabel(minutes: LockGraceMinutes): string {
  const grace = graceOf(minutes);
  if (grace === 0) return 'Immediately';
  return `${grace}${NBSP}${grace === 1 ? 'minute' : 'minutes'}`;
}

/** The line under "Lock after", following the choice (D75). Exported for tests. */
export function lockAfterLine(minutes: LockGraceMinutes): string {
  const grace = graceOf(minutes);
  return grace === 0
    ? 'It locks every time you leave it.'
    : `Come back within ${lockAfterLabel(grace)} and it opens without asking.`;
}

/**
 * What the lock switch says under its name. Its first sentence follows "Lock
 * after" (D75), so it says when the lock comes up. It says what the lock
 * leaves out: a reminder is on the lock screen, outside the app (policy audit
 * of step 180), though never with a prediction's words. Exported for tests.
 */
export function appLockLine(
  support: LockSupport,
  method: LockMethod,
  failed: boolean,
  /** "Lock after" (D75): how long the app may be away before coming back locks it. */
  graceMinutes: LockGraceMinutes,
  /** The passcode page's name in iOS Settings, which follows the phone's hardware. */
  page = 'Face ID & Passcode',
): string {
  if (support === 'no_passcode') {
    return `This iPhone has no passcode, so there is nothing to lock with. Set one in Settings → ${page}, then turn this on.`;
  }
  const unlock =
    method === 'your passcode' ? 'your iPhone passcode' : `${method} or your iPhone passcode`;
  const grace = graceOf(graceMinutes);
  const when =
    grace === 0
      ? `Locks ${APP_NAME} each time it opens or comes back to the front, and covers it in the app switcher.`
      : `Locks ${APP_NAME} once you’ve been away from it for more than ${lockAfterLabel(grace)}, and covers it in the app switcher.`;
  const line = `${when} Unlock opens it with ${unlock}. For a phone someone else picks up. Reminders aren’t covered, but they never show a prediction’s words.`;
  return failed ? `${APP_LOCK_FAILED} ${line}` : line;
}

/**
 * The app lock (roadmap D64, step 180), for a phone someone else picks up
 * (blind playtests 2026-11-13e and 2026-11-14, the top privacy finding of
 * both). The iPhone checks before the switch moves either
 * way, so the person who turns it on can open it, and nobody else turns it
 * off. Nothing on a build or platform that can't lock; rechecked on return
 * to the app, since a passcode is set in iOS Settings. Under it, while the
 * lock is on and the phone can keep it, "Lock after" (D75).
 */
function AppLockRow() {
  const appLock = useSettingsStore((s) => s.appLock);
  const grace = useSettingsStore((s) => s.appLockGraceMinutes);
  const setEnabled = useLockStore((s) => s.setEnabled);
  const [support, setSupport] = useState<LockSupport | null>(null);
  const [method, setMethod] = useState<LockMethod>('your passcode');
  const [page, setPage] = useState('Face ID & Passcode');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const [nextSupport, nextMethod, nextPage] = await Promise.all([
        lockSupport(),
        lockMethod(),
        passcodeSettingsPage(),
      ]);
      if (!live) return;
      setSupport(nextSupport);
      setMethod(nextMethod);
      setPage(nextPage);
    };
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (support === null || support === 'unsupported') return null;

  const change = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await setEnabled(on);
      setFailed(result === 'failed');
      // The row's hint alone isn't read out when it changes.
      if (result === 'failed') AccessibilityInfo.announceForAccessibility(APP_LOCK_FAILED);
      // The phone may have lost its passcode since this row was drawn.
      if (result === 'no_passcode') setSupport('no_passcode');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ToggleRow
        label={appLockLabel(method)}
        description={appLockLine(support, method, failed, grace, page)}
        value={appLock}
        onValueChange={(v) => void change(v)}
        testID="toggle-app-lock"
      />
      {appLock && support === 'ready' && <LockAfterRow />}
    </>
  );
}

/**
 * "Lock after" (roadmap D75, the owner, 2026-11-23): how long the app may be
 * away before coming back locks it; sooner opens straight in, after a restart
 * too. A stacked row under the lock switch, its label and one line over four
 * chips two to a row (§7.21). The
 * line follows the choice. Changing it asks nothing of the phone (decided):
 * it neither locks nor opens the app now, only the next trip away.
 */
function LockAfterRow() {
  const grace = useSettingsStore((s) => s.appLockGraceMinutes);
  const setGrace = useSettingsStore((s) => s.setAppLockGraceMinutes);
  const [busy, setBusy] = useState(false);
  const choose = async (minutes: LockGraceMinutes) => {
    if (busy || minutes === grace) return;
    setBusy(true);
    try {
      await setGrace(minutes);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.stacked} testID="settings-lock-after-row">
      <Text style={styles.rowLabel}>Lock after</Text>
      <Text style={styles.rowDescription} testID="settings-lock-after-line">
        {lockAfterLine(grace)}
      </Text>
      <View
        style={[styles.chips, styles.chipRow]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Lock after"
        testID="settings-lock-after"
      >
        {LOCK_GRACE_MINUTES.map((minutes) => (
          <OptionChip
            key={minutes}
            title={lockAfterLabel(minutes)}
            active={minutes === grace}
            disabled={busy}
            half
            onPress={() => void choose(minutes)}
            testID={`lock-after-${minutes}`}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One inset card of rows, with an optional footer explaining them: one line,
 * or several, each its own paragraph.
 */
function Group({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: string | readonly string[];
}) {
  const lines = footer === undefined ? [] : typeof footer === 'string' ? [footer] : footer;
  return (
    <View style={styles.group}>
      <View style={styles.card}>{children}</View>
      {/* Keyed by place: two equal lines would share a key by text. */}
      {lines.map((line, i) =>
        line ? (
          <Text key={i} style={styles.footer}>
            {line}
          </Text>
        ) : null,
      )}
    </View>
  );
}

/**
 * A row that opens something: the whole row is the target, ending in its
 * current value (if any) and a chevron (HIG Lists: "use a disclosure
 * indicator"). A row that acts in place (Sign out, Erase) leaves the chevron
 * off and says what it does in its label's weight and colour; one whose verb
 * alone doesn't say it acts can end in a symbol for what it does (`icon`).
 */
function NavRow({
  label,
  value,
  onPress,
  chevron = true,
  icon,
  tone = 'default',
  disabled,
  testID,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  chevron?: boolean;
  /** A trailing symbol for a row that acts in place (export), in the label's ink. */
  icon?: { sf: SFSymbol; ion: ComponentProps<typeof Icon>['fallback'] };
  tone?: 'default' | 'action' | 'destructive';
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <Text
        style={[
          styles.rowLabel,
          styles.rowLabelFill,
          tone === 'action' && styles.rowLabelAction,
          tone === 'destructive' && styles.rowLabelDestructive,
        ]}
      >
        {label}
      </Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {chevron && (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon sf="chevron.right" fallback="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      )}
      {icon && (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`${testID}-icon`}
        >
          <Icon sf={icon.sf} fallback={icon.ion} size={18} color={colors.actionText} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Your data (roadmap D31): every prediction as a CSV, free. It was a Plus
 * feature, and your own record shouldn't be paid for. A row that acts in
 * place: no chevron, the label in semibold ink, and the export symbol at the
 * end, since ink alone no longer marks it as tappable (roadmap D33).
 */
function DataGroup() {
  const { exporting, message, run } = useCsvExport();
  return (
    <Group footer={message ?? 'Every prediction, open and answered, as a spreadsheet file.'}>
      <NavRow
        label={exporting ? 'Preparing…' : 'Export predictions (CSV)'}
        onPress={() => void run()}
        chevron={false}
        icon={{ sf: 'square.and.arrow.up', ion: 'share-outline' }}
        tone="action"
        disabled={exporting}
        testID="settings-export"
      />
    </Group>
  );
}

/** How scoring works, the terms, and the privacy policy once it's hosted. */
function AboutGroup({ onOpenScoring }: { onOpenScoring?: () => void }) {
  const open = (url: string) => {
    openBrowserAsync(url).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[settings] could not open link:', e);
    });
  };
  return (
    // The version under the links: what a bug report quotes.
    <Group footer={APP_VERSION ? `${APP_NAME} ${APP_VERSION}` : undefined}>
      {onOpenScoring && (
        <NavRow label="How scoring works" onPress={onOpenScoring} testID="settings-scoring" />
      )}
      {/* Guideline 5.1.1(i): the privacy policy easily reached in the app, not
          only in the listing (roadmap step 36). It appears once
          PRIVACY_POLICY_URL is set, the switch that lights up the paywall's
          link; the terms are Apple's standard EULA, which the paywall links
          too. */}
      {PRIVACY_POLICY_URL && (
        <NavRow
          label="Privacy policy"
          onPress={() => open(PRIVACY_POLICY_URL as string)}
          testID="settings-privacy-link"
        />
      )}
      <NavRow
        label="Terms of use"
        onPress={() => open(TERMS_OF_USE_URL)}
        testID="settings-terms-link"
      />
      {/* A way to reach the developer from inside the app (guideline 1.5). */}
      <NavRow
        label="Help and support"
        onPress={() => open(SUPPORT_URL)}
        testID="settings-support-link"
      />
    </Group>
  );
}

/**
 * What the Notifications toggle can't say on its own (roadmap step 38): iOS
 * hasn't been asked yet, or has been told no. The app asks in context, so a
 * user who skipped Home's prompt can still allow reminders here, and one who
 * refused gets a way to the iOS setting. Rechecked on return to the app, so
 * a change made in iOS Settings shows at once. Nothing on web or once allowed.
 */
function NotificationPermissionRow() {
  const [permission, setPermission] = useState<ReminderPermission | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const current = await reminderPermission();
      if (live) setPermission(current);
    };
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (permission !== 'undetermined' && permission !== 'denied') return null;
  const asked = permission === 'denied';
  return (
    <View style={styles.permission} testID="settings-notification-permission">
      <Text style={styles.rowDescription}>
        {asked
          ? `Notifications are off for ${APP_NAME} in iOS Settings, so reminders can’t reach you.`
          : 'iOS hasn’t been asked yet, so reminders can’t reach you.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        style={styles.permissionAction}
        onPress={() => {
          if (asked) {
            void Linking.openSettings();
            return;
          }
          void (async () => setPermission(await askForReminders()))();
        }}
        testID="settings-notification-permission-action"
      >
        <Text style={styles.rowLabelAction}>{asked ? 'Open Settings' : 'Allow reminders'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The way out, alone at the bottom where destructive settings live. Apple
 * requires account deletion be easy to find in the app (Guideline
 * 5.1.1(v)); a guest gets the equivalent, Erase, which removes everything the
 * app keeps on this phone, anything an account signed in here before left
 * included (`wipeEverythingOnDevice`). It opens a confirmation, so the row
 * itself is just red words.
 */
function DeleteGroup({ onOpenDelete }: { onOpenDelete: () => void }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return null;
  return (
    <Group>
      <NavRow
        label={status === 'authenticated' ? 'Delete account' : 'Erase your data on this phone'}
        onPress={onOpenDelete}
        chevron={false}
        tone="destructive"
        testID="settings-delete"
      />
    </Group>
  );
}

/**
 * The question sign-out asks when signing out would lose something for good
 * (D69 (a)): changes the server doesn't have, or categories only this phone
 * has (round 6, N1, N2).
 */
export const SIGN_OUT_ANYWAY_TITLE = 'Sign out anyway?';

/**
 * What that question says, naming only the counts above zero. `unsynced`
 * counts every change the server doesn't have yet: a log, an answer, an edit
 * or a note, and a deletion. An edit not yet sent goes with the account's
 * rows and never reaches the server; a deletion not yet sent stays on this
 * phone (its record is one of the integrity counts) and is sent when the same
 * account signs in here again. So "removes it from this phone" was untrue of
 * a deletion, and "won't reach the server" untrue of one whose account comes
 * back here: "may not" is true of both (main session, round 6).
 * `localCategories`: the categories added, renamed, given an icon or hidden,
 * which never sync and go with the account's rows. The store asks only with
 * one above zero; with neither, it still says something is at stake rather
 * than nothing. Exported for tests.
 */
export function unsyncedSignOutLine({
  unsynced,
  localCategories,
}: {
  unsynced: number;
  localCategories: number;
}): string {
  const lines: string[] = [];
  if (unsynced > 0) {
    lines.push(
      unsynced === 1
        ? "1 change hasn't reached the server yet and may not if you sign out now."
        : `${localCount(unsynced)} changes haven't reached the server yet and may not if you sign out now.`,
    );
  }
  if (localCategories > 0) {
    lines.push(
      localCategories === 1
        ? '1 category you added or changed lives only on this phone and will be removed.'
        : `${localCount(localCategories)} categories you added or changed live only on this phone and will be removed.`,
    );
  }
  return lines.length > 0
    ? lines.join(' ')
    : "Something on this phone hasn't reached the server yet and may not if you sign out now.";
}

/**
 * Signed out: a way in, and what being signed out means for your data.
 * Signed in: who you are, and a way out. Sign-out takes the account's
 * predictions off this phone after one more sync (owner decision 2026-11-19,
 * D69 (a)); signing back in brings back everything the server has. So it
 * asks first only when signing out would lose something for good: changes
 * that couldn't reach the server, or categories only this phone has. The
 * footer also says what never reaches the server and so goes for good:
 * categories added or changed (D39, D40). The counts only this phone keeps
 * stay on it through a sign-out (`INTEGRITY_COUNT_TABLES` in
 * src/db/account.ts; round 6), so the footer no longer names them.
 *
 * Under the under-13 rule (roadmap D70): a guest gets one static row, "Kept on
 * this phone", and the explanation (shown on any build, accounts or not: it
 * also says why Plus, Coach and Usage stats are gone from You); an account
 * signed in before is frozen, with Sign out kept and the footer saying backup
 * is off. Never a way to sign in.
 */
function AccountGroup({ onOpenAccount }: { onOpenAccount?: () => void }) {
  const accountsAvailable = useAuthStore((s) => s.accountsAvailable);
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const pending = useAuthStore((s) => s.pending);
  const signOut = useAuthStore((s) => s.signOut);
  const localOnly = useAgeStore((s) => s.localOnly);
  // Sign-out can wait about 15 seconds with no connection (the server's
  // turn, then this phone's own), so the row says it's working, as the
  // export row does, and a failure is said rather than dropped.
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (localOnly && status !== 'authenticated') {
    return (
      <View testID="settings-account">
        <Group footer={[LOCAL_ONLY_GUEST_FOOTER, LOCAL_ONLY_GUEST_WHERE]}>
          <View style={styles.row} testID="settings-local-only">
            <Text style={styles.rowLabel}>{LOCAL_ONLY_GUEST_ROW}</Text>
          </View>
        </Group>
      </View>
    );
  }

  if (!accountsAvailable) return null;

  const onSignOut = async (discardUnsynced = false) => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      const outcome = await (discardUnsynced ? signOut({ discardUnsynced: true }) : signOut());
      // Ended on this phone, whether or not the server heard (`localOnly`):
      // nothing to say, the screen moves to signed out by itself.
      if (outcome.ok) return;
      if ('unsynced' in outcome) {
        // Nothing changed yet: still signed in, every row still here. Asked
        // in a system alert, whose destructive button does nothing while the
        // app is locked (the alert sits above the lock screen; security
        // review, 2026-11-18). Confirming goes again, discarding what it
        // named; if more is at stake by then, the store asks again with the
        // new counts and so does this, each time (round 6, N2).
        askToConfirm(SIGN_OUT_ANYWAY_TITLE, unsyncedSignOutLine(outcome), 'Sign out', () => {
          if (appLocked()) return;
          void onSignOut(true);
        });
        return;
      }
      // Still signed in, and the store's own words say what happened: what's
      // unsynced couldn't be counted, or even this phone's copy of the session
      // stayed (nothing changed then), or it stayed after the account's rows
      // had left this phone (`SIGN_OUT_FAILED_AFTER_WIPE`, round 7: the
      // backed-up ones come back, what the person agreed to lose is gone).
      // Shown and said alike.
      setSignOutError(outcome.error);
      AccessibilityInfo.announceForAccessibility(outcome.error);
    } finally {
      setSigningOut(false);
    }
  };

  if (status === 'authenticated') {
    return (
      <View testID="settings-account">
        <Group
          footer={
            localOnly
              ? // Frozen (D70, call 3): who is signed in, then the spec's words.
                `${describeAccount(email)} ${LOCAL_ONLY_FROZEN_FOOTER}`
              : `${describeAccount(email)} Your predictions are backed up. Signing out removes them from this phone, and signing back in brings them back. Categories you added or changed live only on this phone, so signing out removes them.`
          }
        >
          <NavRow
            label={signingOut ? 'Signing out…' : 'Sign out'}
            onPress={() => void onSignOut()}
            chevron={false}
            tone="action"
            disabled={pending || signingOut}
            testID="settings-sign-out"
          />
        </Group>
        {signOutError && (
          <Text style={styles.error} testID="settings-sign-out-error">
            {signOutError}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View testID="settings-account">
      <Group footer="Not signed in. Your predictions live only on this phone.">
        {onOpenAccount ? (
          <NavRow label="Sign in" onPress={onOpenAccount} testID="settings-sign-in" />
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Account</Text>
          </View>
        )}
      </Group>
    </View>
  );
}

/**
 * Sign in with Apple can hand over a private relay address that the user has
 * never seen, so it reads better as the method than as an address.
 */
function describeAccount(email: string | null): string {
  if (!email) return 'Signed in.';
  // New relay addresses are on private.icloud.com (Apple, 2026-08-24).
  if (/@(privaterelay\.appleid\.com|private\.icloud\.com)$/i.test(email)) {
    return 'Signed in with Apple.';
  }
  return `Signed in as ${email}.`;
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  // One switch element for the whole row (roadmap step 41): VoiceOver doesn't
  // attach nearby text to a bare Switch, so on its own it was an unnamed
  // "switch, on". The row carries the name, state and description; the
  // inner Switch is hidden from assistive tech and still works by touch.
  //
  // The switch sits on the label's line and the description runs full width
  // beneath both. Centred on label and description together, it floated
  // between the two lines and lined up with neither (first device run,
  // 2026-11-07, iOS 26).
  return (
    <Pressable
      style={[styles.row, styles.toggleRow]}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      // The cross-platform prop as well: react-native-web maps this one.
      aria-checked={value}
      testID={`${testID}-row`}
    >
      <View style={styles.toggleHead}>
        <Text style={[styles.rowLabel, styles.toggleLabel]}>{label}</Text>
        <ToggleSwitch
          value={value}
          onValueChange={onValueChange}
          testID={testID}
          style={styles.switchFixed}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <Text style={[styles.rowDescription, styles.toggleDescription]}>{description}</Text>
    </Pressable>
  );
}

/**
 * What the Usage stats switch covers. Since D43 (2026-11-03) a guest's funnel
 * counts go up with no account, device or install id. Each row still has a
 * random id of its own, so the server can drop a retried copy, which is why
 * it no longer says "no id at all" (policy audit F7, 2026-11-18). The events
 * carry numbers as well as names (src/analytics/events.ts): an answer's
 * confidence and whether it happened, the Warm-up's score. "Counts of which
 * features get used" undersold that (policy re-audit N2, 2026-11-19).
 */
export const USAGE_STATS_DESCRIPTION =
  "Which features get used, with numbers like the confidence you chose and whether it happened. Never the words of your predictions or notes. Before you sign in, a few counts go up with no account, device or install id; once you sign in, they're tied to your account. Turning this off deletes what's queued.";

const styles = StyleSheet.create({
  wrap: { gap: space.xxl, padding: space.lg, paddingBottom: space.huge },
  group: { gap: space.sm },
  // Inset grouped: one surface card per group on the canvas, rows divided by
  // hairlines (DESIGN_SYSTEM §7.21).
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: { ...type.footnote, color: colors.textSecondary, paddingHorizontal: space.lg },
  // The app's error style (Sign in, Delete account), under its group and
  // inset as the group's footer is. 5.2:1 on canvas in light.
  error: {
    ...type.subhead,
    color: colors.destructive,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  // A switch row: the label and switch on one line, the description under both.
  toggleRow: { alignItems: 'stretch', flexDirection: 'column', gap: 0 },
  // When the label can't sit on one line beside the switch, the switch goes
  // under it instead of the label breaking mid-word ("Notifica / tions" at
  // the largest sizes, where the iOS switch keeps its 63pt; playtest
  // 2026-11-08b, finding 14).
  toggleHead: {
    alignItems: 'center',
    columnGap: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.sm,
  },
  // Its own width first, so a label too long for the line wraps the switch
  // under it; past the whole row it wraps by word.
  toggleLabel: { flexGrow: 1, flexShrink: 1 },
  // At the trailing edge on either line, as iOS keeps switches.
  switchFixed: { flexShrink: 0, marginLeft: 'auto' },
  // The switch (28pt on iOS 26) is taller than the label's line, which already
  // leaves a gap above the description.
  toggleDescription: { marginTop: 0 },
  rowLabel: { ...type.callout, fontWeight: '500', color: colors.textPrimary },
  // The label wraps and the switch keeps its size: at large text a long word
  // held the label wide and pushed the switch off the card's clipped edge
  // (playtest 2026-11-08, finding 2).
  rowLabelFill: { flex: 1, minWidth: 0 },
  rowLabelAction: { ...type.callout, fontWeight: '600', color: colors.actionText },
  rowLabelDestructive: { color: colors.destructive },
  rowValue: { ...type.callout, color: colors.textSecondary },
  rowDescription: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  // A row whose control sits under its label: the reminder and digest times,
  // and "Lock after".
  stacked: {
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  chips: { marginTop: space.md },
  // "Lock after"'s chips, wrapping two to a row.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  permission: {
    borderBottomColor: colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  permissionAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
