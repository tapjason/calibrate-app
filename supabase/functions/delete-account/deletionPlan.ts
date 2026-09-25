// Pure decision logic for account deletion: which legs run, what the request
// may carry, and how each upstream answer is classified.
//
// Kept free of Deno imports for the same reason as the webhook's
// entitlementFromEvent.ts — Jest can test it directly
// (`deletionPlan.test.ts`), and it is the part that decides whether a user's
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

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** PEM, PKCS#8 — the .p8 file's contents. */
  privateKey: string;
  /** The bundle id, e.g. com.calibrate.app. */
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
