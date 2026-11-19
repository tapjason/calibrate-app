// Pure decision logic for account deletion: which legs run, what the request
// may carry, and how each upstream answer is classified.
//
// Kept free of Deno imports for the same reason as the webhook's
// entitlementFromEvent.ts — Jest can test it directly
// (its test file sits beside it), and it is the part that decides whether a user's
// data is actually gone.
//
// The shape it encodes (docs/ACCOUNT_SPEC.md §3.3):
//
//   1. Apple token revocation   — best effort, only with a code and a key
//   2. RevenueCat customer      — best effort, only with a write key
//   3. auth.admin.deleteUser    — mandatory, and LAST
//
// The auth user goes last because it is the one step the user can't retry
// once it succeeds: the session dies with it. If an earlier leg fails and we
// stopped, the account would still exist and "Delete account" would still
// work. The best-effort legs never stop the deletion — a user who asked to be
// deleted must not be kept on file because a third party was down.
//
// Legs 1 and 2 are independent, so they run at the same time (security
// review, 2026-11-18): the function used to make three 8-second calls one
// after another before the delete, longer than the app waited. `runDeletion`
// below starts both, waits until both have settled (each is cut off at
// LEG_DEADLINE_MS), and only then deletes the user.
//
// The Apple leg revokes only the account's own grant (same review). The app
// gets the authorization code from Apple's sheet, which signs in with
// whatever Apple ID the phone uses; if that isn't the Apple ID linked to the
// account, revoking it would end some other account's grant and leave this
// one's. So after the exchange, the `sub` in the id_token Apple returns is
// compared with the account's Apple identity, and on a mismatch nothing is
// revoked (`runAppleLeg`).

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** PEM, PKCS#8 — the .p8 file's contents. */
  privateKey: string;
  /** The bundle id, app.fairlysure. */
  clientId: string;
}

export interface RevenueCatConfig {
  apiKey: string;
  projectId: string;
}

export interface DeletionConfig {
  apple: AppleConfig | null;
  revenuecat: RevenueCatConfig | null;
}

/**
 * Read the optional legs' secrets. A leg with any secret missing is off — it
 * is skipped and logged, never half-configured. That lets the core deletion
 * ship before the Apple key or a write-scoped RevenueCat key exists.
 */
export function readConfig(get: (name: string) => string | undefined): DeletionConfig {
  const val = (name: string) => {
    const v = get(name)?.trim();
    return v ? v : null;
  };

  const teamId = val('APPLE_TEAM_ID');
  const keyId = val('APPLE_SIWA_KEY_ID');
  // Secrets set from a shell often arrive with literal "\n" in place of
  // newlines; a PEM with those doesn't parse.
  const privateKey = val('APPLE_SIWA_PRIVATE_KEY')?.replace(/\\n/g, '\n') ?? null;
  const clientId = val('APPLE_CLIENT_ID');

  const apiKey = val('REVENUECAT_DELETE_KEY');
  const projectId = val('REVENUECAT_PROJECT_ID');

  return {
    apple:
      teamId && keyId && privateKey && clientId
        ? { teamId, keyId, privateKey, clientId }
        : null,
    revenuecat: apiKey && projectId ? { apiKey, projectId } : null,
  };
}

/** Apple authorization codes are short opaque strings; this is generous. */
export const MAX_APPLE_CODE_LENGTH = 1_000;
export const MAX_BODY_BYTES = 4_000;

export interface DeletionRequest {
  /** Fresh Sign in with Apple authorization code, valid for ~10 minutes. */
  appleAuthorizationCode: string | null;
}

/**
 * Narrow an untrusted body. The body is optional — an empty one is a valid
 * request for a non-Apple account — but anything present must be well formed.
 */
export function parseRequest(raw: unknown): DeletionRequest | null {
  if (raw === null || raw === undefined) return { appleAuthorizationCode: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const code = (raw as Record<string, unknown>).apple_authorization_code;
  if (code === undefined || code === null) return { appleAuthorizationCode: null };
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_APPLE_CODE_LENGTH) return null;
  return { appleAuthorizationCode: trimmed };
}

export interface DeletionPlan {
  revokeApple: boolean;
  deleteRevenueCat: boolean;
  /** Why a leg isn't running — logged, and the assertion surface for tests. */
  skipped: string[];
}

export function planDeletion(config: DeletionConfig, req: DeletionRequest): DeletionPlan {
  const skipped: string[] = [];

  let revokeApple = false;
  if (!req.appleAuthorizationCode) {
    skipped.push('apple: no authorization code (not an Apple account, or the user declined re-auth)');
  } else if (!config.apple) {
    skipped.push('apple: Sign in with Apple key not configured');
  } else {
    revokeApple = true;
  }

  let deleteRevenueCat = false;
  if (!config.revenuecat) {
    skipped.push('revenuecat: write-scoped key not configured');
  } else {
    deleteRevenueCat = true;
  }

  return { revokeApple, deleteRevenueCat, skipped };
}

export type LegOutcome = 'done' | 'already_gone' | 'failed';

/**
 * RevenueCat's delete-customer answer. A 404 means there was never a customer
 * under this id (the user never opened the paywall) or it's already deleted —
 * either way the goal state holds.
 */
export function classifyRevenueCat(status: number): LegOutcome {
  if (status >= 200 && status < 300) return 'done';
  if (status === 404) return 'already_gone';
  return 'failed';
}

/** The customer URL for RevenueCat's v2 delete. The id is path-encoded. */
export function revenueCatCustomerUrl(projectId: string, userId: string): string {
  return (
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}` +
    `/customers/${encodeURIComponent(userId)}`
  );
}

// ---------------------------------------------------------------------------
// The Apple leg: whose grant is revoked
// ---------------------------------------------------------------------------

/** Why the Apple leg didn't revoke. Never carries an identifier. */
export const APPLE_SKIPPED = {
  identitiesUnread: "apple: couldn't read the account's identities; not revoked",
  noIdentity: 'apple: the account has no Apple identity; not revoked',
  noSubject: 'apple: no usable identity token from Apple; not revoked',
  otherAppleId: "apple: the code is for a different Apple ID than the account's; not revoked",
  failed: 'apple: revocation failed',
  timedOut: 'apple: timed out',
} as const;

const MAX_ID_TOKEN_LENGTH = 16_000;

/**
 * The payload of a JWT, decoded and NOT verified: no signature, issuer,
 * audience or expiry check. Used for one thing only, reading the `sub` of the
 * id_token Apple returned to our own token exchange (made over TLS with our
 * client secret) to compare it with the account's Apple identity. Never trust
 * it for anything else. Null for anything malformed.
 */
export function decodeJwtPayload(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > MAX_ID_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === '') return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    // UTF-8 bytes to a string; throws on an invalid sequence.
    const text = decodeURIComponent(
      Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const payload: unknown = JSON.parse(text);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Every Apple subject (Apple's stable user id) on the account's identities, as
 * the service role reads them (`auth.admin.getUserById`). Supabase's identity
 * `id` is the provider's user id (auth.identities.provider_id), and
 * identity_data keeps `sub` and `provider_id` (migration 009 strips only the
 * name and picture), so all three are read; for an Apple identity they agree.
 */
export function appleSubjectsFromIdentities(identities: unknown): string[] {
  if (!Array.isArray(identities)) return [];
  const subjects = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') subjects.add(value);
  };
  for (const identity of identities) {
    if (typeof identity !== 'object' || identity === null) continue;
    const i = identity as { provider?: unknown; id?: unknown; identity_data?: unknown };
    if (i.provider !== 'apple') continue;
    add(i.id);
    if (typeof i.identity_data === 'object' && i.identity_data !== null) {
      const data = i.identity_data as { sub?: unknown; provider_id?: unknown };
      add(data.sub);
      add(data.provider_id);
    }
  }
  return [...subjects];
}

export type AppleSubjectCheck = { revoke: true } | { revoke: false; skipped: string };

/**
 * Does the id_token from the exchange belong to the account's Apple identity?
 * Exact, case-sensitive comparison of `sub`.
 */
export function checkAppleSubject(
  idToken: unknown,
  accountSubjects: readonly string[],
): AppleSubjectCheck {
  if (accountSubjects.length === 0) return { revoke: false, skipped: APPLE_SKIPPED.noIdentity };
  const sub = decodeJwtPayload(idToken)?.sub;
  if (typeof sub !== 'string' || sub === '') {
    return { revoke: false, skipped: APPLE_SKIPPED.noSubject };
  }
  if (!accountSubjects.includes(sub)) return { revoke: false, skipped: APPLE_SKIPPED.otherAppleId };
  return { revoke: true };
}

/** The fields of Apple's token response the leg reads. */
export interface AppleTokens {
  refresh_token?: unknown;
  access_token?: unknown;
  id_token?: unknown;
}

export interface AppleLegDeps {
  /** The account's identities, read with the service role. Throws if they can't be read. */
  readIdentities: () => Promise<unknown>;
  /** Exchanges the authorization code at Apple. Throws on any failure. */
  exchangeCode: () => Promise<AppleTokens>;
  /** Revokes one token at Apple. Throws on any failure. */
  revokeToken: (token: string, hint: 'refresh_token' | 'access_token') => Promise<void>;
  /** Server log. Given no identifier, code or token. */
  log?: (message: string) => void;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'unknown error';
}

/**
 * Revoke the account's Sign in with Apple grant, and only that one. Resolves
 * with what to add to `skipped` (nothing when the grant was revoked). Never
 * throws.
 *
 * The identities are read before the code is exchanged, so an account with no
 * Apple identity never sends the code to Apple. On a mismatch the token the
 * exchange produced is left alone: revoking it would end the grant of the
 * Apple ID the phone is signed into, which is some other account's.
 */
export async function runAppleLeg(deps: AppleLegDeps): Promise<string[]> {
  const log = deps.log ?? (() => undefined);

  let subjects: string[];
  try {
    subjects = appleSubjectsFromIdentities(await deps.readIdentities());
  } catch (e) {
    log(`[delete-account] apple: identities unread (${messageOf(e)})`);
    return [APPLE_SKIPPED.identitiesUnread];
  }
  if (subjects.length === 0) return [APPLE_SKIPPED.noIdentity];

  let tokens: AppleTokens;
  try {
    tokens = await deps.exchangeCode();
  } catch (e) {
    log(`[delete-account] apple: token exchange failed (${messageOf(e)})`);
    return [APPLE_SKIPPED.failed];
  }

  const check = checkAppleSubject(tokens.id_token, subjects);
  if (!check.revoke) {
    log(`[delete-account] ${check.skipped}`);
    return [check.skipped];
  }

  const refresh =
    typeof tokens.refresh_token === 'string' && tokens.refresh_token !== ''
      ? tokens.refresh_token
      : null;
  const access =
    typeof tokens.access_token === 'string' && tokens.access_token !== ''
      ? tokens.access_token
      : null;
  const token = refresh ?? access;
  if (!token) {
    log('[delete-account] apple: no token in the exchange response');
    return [APPLE_SKIPPED.failed];
  }
  try {
    await deps.revokeToken(token, refresh ? 'refresh_token' : 'access_token');
  } catch (e) {
    log(`[delete-account] apple: revoke failed (${messageOf(e)})`);
    return [APPLE_SKIPPED.failed];
  }
  return [];
}

// ---------------------------------------------------------------------------
// The order: both best-effort legs at once, the user last
// ---------------------------------------------------------------------------

/**
 * How long a best-effort leg may take before the deletion goes ahead without
 * it. Above the Apple leg's own worst case (an identity read, then two 8 s
 * calls), so it only bites on something that hangs.
 */
export const LEG_DEADLINE_MS = 20_000;

export const REVENUECAT_SKIPPED = {
  failed: 'revenuecat: delete failed',
  timedOut: 'revenuecat: timed out',
} as const;

export interface DeletionSteps {
  /** Best effort. Resolves with what to add to `skipped`. Null when the plan skips it. */
  apple: (() => Promise<string[]>) | null;
  /** Best effort. Resolves with what to add to `skipped`. Null when the plan skips it. */
  revenuecat: (() => Promise<string[]>) | null;
  /** Mandatory, and last. Resolves true when the auth user is gone. */
  deleteUser: () => Promise<boolean>;
  legDeadlineMs?: number;
}

export interface DeletionResult {
  deleted: boolean;
  /** Only the legs' reasons; the caller adds the plan's. */
  skipped: string[];
}

class LegTimeout extends Error {}

/** Settles with the leg's reasons, or rejects at the deadline or on a throw. */
function settleLeg(
  run: () => Promise<string[]>,
  deadlineMs: number,
): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LegTimeout()), deadlineMs);
  });
  return Promise.race([Promise.resolve().then(run), deadline]).finally(() => clearTimeout(timer));
}

/**
 * Run the deletion: Apple and RevenueCat at the same time, then, once both
 * have settled (done, failed, thrown or cut off at the deadline), the auth
 * user. A best-effort leg's failure never stops the deletion. Never throws.
 */
export async function runDeletion(steps: DeletionSteps): Promise<DeletionResult> {
  const deadlineMs = steps.legDeadlineMs ?? LEG_DEADLINE_MS;
  const run = (leg: (() => Promise<string[]>) | null) =>
    leg ? settleLeg(leg, deadlineMs) : Promise.resolve<string[]>([]);

  const [apple, revenuecat] = await Promise.allSettled([run(steps.apple), run(steps.revenuecat)]);

  const skipped: string[] = [];
  const collect = (
    outcome: PromiseSettledResult<string[]>,
    reasons: { failed: string; timedOut: string },
  ) => {
    if (outcome.status === 'fulfilled') skipped.push(...outcome.value);
    else skipped.push(outcome.reason instanceof LegTimeout ? reasons.timedOut : reasons.failed);
  };
  collect(apple, APPLE_SKIPPED);
  collect(revenuecat, REVENUECAT_SKIPPED);

  let deleted = false;
  try {
    deleted = (await steps.deleteUser()) === true;
  } catch {
    deleted = false;
  }
  return { deleted, skipped };
}

/**
 * Claims for the Sign in with Apple client secret (an ES256 JWT, signed with
 * the .p8 key, `kid` = key id). Apple caps the lifetime at six months; this
 * mints one per request, so five minutes is plenty.
 */
export function appleClientSecretClaims(
  config: AppleConfig,
  nowSeconds: number,
): { iss: string; iat: number; exp: number; aud: string; sub: string } {
  return {
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  };
}
