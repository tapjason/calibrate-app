// The app lock's one door to the phone (L5, roadmap D64, step 180). The only
// module that talks to expo-local-authentication.
//
// The iPhone does the checking: Face ID (or Touch ID) first, the device
// passcode as the way in when that fails or isn't set up
// (`disableDeviceFallback: false`, Apple's deviceOwnerAuthentication policy).
// The app learns only whether it passed.
//
// Everywhere this can't run (web, Android, a development build made before
// the package was added) it reads as "unsupported", and the lock never arms:
// a lock that can't be opened is worse than none. Nothing here throws. Under
// Jest the native module is jest-expo's empty mock, so tests pass a fake
// (`__setLockDepsForTests`).

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** What the phone can do for a lock right now. */
export type LockSupport =
  /** Face ID, Touch ID or a passcode is set: a lock can be turned on. */
  | 'ready'
  /** The phone has no passcode at all, so there is nothing to check against. */
  | 'no_passcode'
  /** Not an iPhone build with the module in it. */
  | 'unsupported';

/** What the person unlocks with, for the words on screen (HIG: name only what this phone has). */
export type LockMethod = 'Face ID' | 'Touch ID' | 'your passcode';

/** How one check ended. */
export type LockCheck =
  | 'passed'
  /** The person, the system or the app closed the prompt. Still locked; no message. */
  | 'cancelled'
  /** The phone has no passcode any more: nothing can be checked. */
  | 'no_passcode'
  /** Anything else. Still locked. */
  | 'failed';

/** The slice of expo-local-authentication this module uses. */
export interface LockDeps {
  getEnrolledLevelAsync(): Promise<number>;
  supportedAuthenticationTypesAsync(): Promise<number[]>;
  authenticateAsync(options: {
    promptMessage: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean; error?: string }>;
}

let override: LockDeps | null | undefined;
let loaded: LockDeps | null | undefined;

function loadModule(): LockDeps | null {
  if (override !== undefined) return override;
  if (loaded !== undefined) return loaded;
  if (Platform.OS !== 'ios') {
    // On web the module imports, then `authenticateAsync` throws.
    loaded = null;
    return loaded;
  }
  try {
    // Ask for the native module first, the way that answers null. The package
    // itself asks the way that throws, and Metro reports a throw from a
    // `require` made outside module load as fatal before any catch here sees
    // it (code review of step 180): a build without the module would have
    // shown an error screen on opening You.
    if (!requireOptionalNativeModule('ExpoLocalAuthentication')) {
      loaded = null;
      return loaded;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-local-authentication') as Partial<LockDeps>;
    loaded =
      typeof mod.authenticateAsync === 'function' &&
      typeof mod.getEnrolledLevelAsync === 'function' &&
      typeof mod.supportedAuthenticationTypesAsync === 'function'
        ? (mod as LockDeps)
        : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lock] module unavailable:', e);
    loaded = null;
  }
  return loaded;
}

/**
 * Whether this build can lock at all. Synchronous, so launch can decide
 * before the first screen: with the module missing the app opens as it
 * always did.
 */
export function lockSupported(): boolean {
  return loadModule() !== null;
}

/** expo-local-authentication's SecurityLevel: 0 none, 1 a passcode, 2 and 3 biometrics. */
const LEVEL_PASSCODE = 1;
const LEVEL_BIOMETRIC = 2;
/** AuthenticationType: 1 fingerprint, 2 face. */
const TYPE_FINGERPRINT = 1;
const TYPE_FACE = 2;

/** What the phone can do for a lock right now. */
export async function lockSupport(): Promise<LockSupport> {
  const mod = loadModule();
  if (!mod) return 'unsupported';
  try {
    const level = await mod.getEnrolledLevelAsync();
    return typeof level === 'number' && level >= LEVEL_PASSCODE ? 'ready' : 'no_passcode';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lock] could not read what this phone has:', e);
    return 'unsupported';
  }
}

/**
 * What to call the check on this phone. Never names Face ID where there is
 * none, or where it isn't set up or is switched off for the app (the phone
 * then asks only for the passcode): with neither in use it is the passcode.
 */
export async function lockMethod(): Promise<LockMethod> {
  const mod = loadModule();
  if (!mod) return 'your passcode';
  try {
    const [types, level] = await Promise.all([
      mod.supportedAuthenticationTypesAsync(),
      mod.getEnrolledLevelAsync(),
    ]);
    if (typeof level !== 'number' || level < LEVEL_BIOMETRIC) return 'your passcode';
    if (Array.isArray(types) && types.includes(TYPE_FACE)) return 'Face ID';
    if (Array.isArray(types) && types.includes(TYPE_FINGERPRINT)) return 'Touch ID';
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lock] could not read how this phone unlocks:', e);
  }
  return 'your passcode';
}

/**
 * The name of the page in iOS Settings where a passcode is set, which follows
 * the phone's hardware, not what is in use: a Touch ID iPhone with no passcode
 * still calls it "Touch ID & Passcode" (code review, round 2).
 */
export async function passcodeSettingsPage(): Promise<string> {
  const mod = loadModule();
  try {
    const types = mod ? await mod.supportedAuthenticationTypesAsync() : [];
    if (Array.isArray(types) && !types.includes(TYPE_FACE) && types.includes(TYPE_FINGERPRINT)) {
      return 'Touch ID & Passcode';
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lock] could not read this phone’s hardware:', e);
  }
  return 'Face ID & Passcode';
}

const CANCELS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

let inFlight: Promise<LockCheck> | null = null;
/** Which prompt owns `inFlight`: an abandoned one must not clear its successor's. */
let checkSeq = 0;

/**
 * Ask the phone to check who is holding it. `reason` is the line iOS shows
 * in its own prompt. One prompt at a time: the module keeps no state of its
 * own, so a second call while one is up gets the first one's answer.
 *
 * `not_available` is "failed", never "no passcode": Face ID can be switched
 * off for one app in Settings without the passcode, and that must not open
 * the lock. Only the phone saying it has no passcode at all does, since
 * removing a passcode takes the passcode.
 */
export function checkLock(reason: string): Promise<LockCheck> {
  if (inFlight) return inFlight;
  const mod = loadModule();
  if (!mod) return Promise.resolve('failed');
  checkSeq += 1;
  const seq = checkSeq;
  const mine = (async (): Promise<LockCheck> => {
    try {
      const result = await mod.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) return 'passed';
      if (result.error === 'passcode_not_set') return 'no_passcode';
      return typeof result.error === 'string' && CANCELS.has(result.error) ? 'cancelled' : 'failed';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[lock] check failed:', e);
      return 'failed';
    } finally {
      // Not a later prompt's slot, if this one was abandoned meanwhile.
      if (checkSeq === seq) inFlight = null;
    }
  })();
  inFlight = mine;
  return mine;
}

/**
 * Forget a prompt that hasn't answered. For when the app goes to the
 * background: iOS closes its prompt there, and if the answer never came the
 * next return must still be able to ask (code review of step 180).
 */
export function abandonCheck(): void {
  checkSeq += 1;
  inFlight = null;
}

/** Test-only: a fake module, null for "not in this build", undefined to load the real one. */
export function __setLockDepsForTests(next: LockDeps | null | undefined): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setLockDepsForTests is only allowed when NODE_ENV=test');
  }
  override = next;
  loaded = undefined;
  inFlight = null;
}
