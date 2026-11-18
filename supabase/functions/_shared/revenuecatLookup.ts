// Asks RevenueCat directly whether a Supabase user has Plus right now.
//
// Shared by two functions (step 189):
//   - coach, when its `entitlements` row is missing or not active Plus: the
//     webhook can miss a purchase (a TRANSFER names users but carries no
//     entitlement; a purchase made under an anonymous id lands under no
//     uuid), and a paying subscriber then got a 403.
//   - revenuecat-webhook, on a TRANSFER event, for every Supabase user it
//     names.
//
// Plain TypeScript with no Deno imports, like
// revenuecat-webhook/entitlementFromEvent.ts, so Jest can test it
// (its test file sits beside it). The fetch is injected; the functions pass
// Deno's global one. The `_shared` folder is Supabase's convention for code
// imported by several functions through a relative path into _shared; the
// deploy bundles it with each function that imports it.
//
// The calls (RevenueCat API v2, a secret key with read permissions only):
//   GET /v2/projects/{project}/customers/{user}/active_entitlements
//       permission customer_information:customers:read
//   GET /v2/projects/{project}/entitlements
//       permission project_configuration:entitlements:read
// The second exists because an active entitlement names RevenueCat's own
// entitlement id (documented as "entla1b2c3d4e5"), not the lookup key the app
// and the webhook use ('plus'). It runs only when the customer has an active
// entitlement that isn't literally 'plus', and its answer is cached for the
// isolate's life.
//
// Secrets: REVENUECAT_READ_KEY (a v2 secret key with exactly those two read
// permissions) and REVENUECAT_PROJECT_ID (shared with delete-account). With
// either unset every lookup is an error, 'not_configured', and both callers
// fail closed: the Coach answers 403, the webhook 500. The key is never
// logged.
//
// Fail closed, always. Only a 200 that names an active plus entitlement is
// Plus. A 404 for the customer means RevenueCat has no such customer: none.
// Everything else (401, 403, 429, 5xx, a network error, the 5-second timeout,
// a body that isn't JSON or isn't the documented shape) is an error, never
// Plus, and never "none" either: the webhook writes "none" as a revocation, so
// an unreadable answer must not look like one.

/** Mirrors EntitlementSource in src/types/index.ts. */
export type EntitlementSource = 'none' | 'trial' | 'monthly' | 'annual' | 'lifetime';

/** The entitlement's lookup key. Mirrors PLUS_ENTITLEMENT_ID in src/billing/revenuecat.ts. */
export const PLUS_ENTITLEMENT_ID = 'plus';

/** A Supabase user id. The app configures RevenueCat with it as the app user id. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REVENUECAT_API_ORIGIN = 'https://api.revenuecat.com';

/** The whole lookup, both calls and every page, must answer within this. */
export const LOOKUP_TIMEOUT_MS = 5_000;

/** RevenueCat clamps `limit` to 1–100. */
const PAGE_LIMIT = 100;
/** A customer has a handful of entitlements; more pages than this is a bad answer. */
const MAX_PAGES = 5;

export interface LookupConfig {
  apiKey: string;
  projectId: string;
}

/**
 * Read the two secrets. Either missing (or blank) means no lookup at all: a
 * half-configured lookup is not a lookup.
 */
export function readLookupConfig(get: (name: string) => string | undefined): LookupConfig | null {
  const val = (name: string) => {
    const v = get(name)?.trim();
    return v ? v : null;
  };
  const apiKey = val('REVENUECAT_READ_KEY');
  const projectId = val('REVENUECAT_PROJECT_ID');
  return apiKey && projectId ? { apiKey, projectId } : null;
}

export type LookupErrorReason =
  | 'not_configured'
  | 'invalid_user_id'
  | 'timeout'
  | 'network'
  | 'bad_json'
  | 'bad_response'
  | 'plus_entitlement_not_found'
  | `http_${number}`;

export type PlusLookup =
  | {
      status: 'plus';
      /** ISO string, or null for a non-expiring (lifetime) entitlement. */
      expiresAt: string | null;
      /**
       * Approximate. active_entitlements names no product, so the plan is
       * inferred from the expiry alone: none means 'lifetime', otherwise
       * 'annual' (the plan most buyers choose, and the one with the trial).
       * Nothing on the server reads `source`; the Coach's gate reads only
       * `is_plus` and `expires_at`, and the app never reads this table.
       */
      source: EntitlementSource;
    }
  | { status: 'none' }
  | { status: 'error'; reason: LookupErrorReason };

/** The part of a fetch Response the lookup reads. */
export interface FetchResponseLike {
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal },
) => Promise<FetchResponseLike>;

/**
 * Per-isolate memory of each project's plus entitlement id. The caller keeps
 * one at module level, so the entitlements list is read once per isolate.
 */
export interface LookupCache {
  plusEntitlementIds: Map<string, string>;
}

export function createLookupCache(): LookupCache {
  return { plusEntitlementIds: new Map() };
}

export interface LookupDeps {
  fetch: FetchLike;
  /** Clock for the expiry comparison; the functions pass Date.now. */
  now: () => number;
  timeoutMs?: number;
  cache?: LookupCache;
  /** Where the error reason goes. Never given the key. */
  log?: (message: string) => void;
}

class LookupFailure extends Error {
  constructor(readonly reason: LookupErrorReason) {
    super(reason);
  }
}

export function activeEntitlementsUrl(projectId: string, userId: string): string {
  return (
    `${REVENUECAT_API_ORIGIN}/v2/projects/${encodeURIComponent(projectId)}` +
    `/customers/${encodeURIComponent(userId)}/active_entitlements?limit=${PAGE_LIMIT}`
  );
}

export function entitlementsUrl(projectId: string): string {
  return (
    `${REVENUECAT_API_ORIGIN}/v2/projects/${encodeURIComponent(projectId)}` +
    `/entitlements?limit=${PAGE_LIMIT}`
  );
}

/**
 * Where `next_page` points, or null for no next page. RevenueCat documents it
 * as a path ("/v2/projects/…"); an absolute URL is accepted only on the API's
 * own origin, so a response can never send the key anywhere else.
 */
function nextPageUrl(nextPage: unknown): string | null {
  if (nextPage === null || nextPage === undefined || nextPage === '') return null;
  if (typeof nextPage !== 'string') throw new LookupFailure('bad_response');
  if (nextPage.startsWith('/v2/')) return `${REVENUECAT_API_ORIGIN}${nextPage}`;
  if (nextPage.startsWith(`${REVENUECAT_API_ORIGIN}/v2/`)) return nextPage;
  throw new LookupFailure('bad_response');
}

/**
 * Every item of a v2 list, following `next_page`. Null when the first page is
 * a 404 and `notFoundIsNone` is set (no such customer).
 */
async function listItems(
  firstUrl: string,
  config: LookupConfig,
  deps: LookupDeps,
  signal: AbortSignal,
  notFoundIsNone: boolean,
): Promise<unknown[] | null> {
  const items: unknown[] = [];
  let url: string | null = firstUrl;
  for (let page = 0; url !== null; page++) {
    if (page >= MAX_PAGES) throw new LookupFailure('bad_response');

    let res: FetchResponseLike;
    try {
      res = await deps.fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
        signal,
      });
    } catch {
      throw new LookupFailure(signal.aborted ? 'timeout' : 'network');
    }

    if (res.status === 404 && notFoundIsNone && page === 0) return null;
    if (res.status !== 200) throw new LookupFailure(`http_${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new LookupFailure(signal.aborted ? 'timeout' : 'bad_json');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new LookupFailure('bad_response');
    }
    const list = body as { items?: unknown; next_page?: unknown };
    if (!Array.isArray(list.items)) throw new LookupFailure('bad_response');
    items.push(...list.items);
    url = nextPageUrl(list.next_page);
  }
  return items;
}

interface ActiveEntitlement {
  entitlementId: string;
  /** ms since epoch, or null for non-expiring. */
  expiresAtMs: number | null;
}

/** Strict to the documented shape: anything else is a bad answer, not a skip. */
function parseActiveEntitlement(item: unknown): ActiveEntitlement {
  if (typeof item !== 'object' || item === null) throw new LookupFailure('bad_response');
  const i = item as { entitlement_id?: unknown; expires_at?: unknown };
  if (typeof i.entitlement_id !== 'string' || i.entitlement_id === '') {
    throw new LookupFailure('bad_response');
  }
  if (i.expires_at === null) return { entitlementId: i.entitlement_id, expiresAtMs: null };
  if (typeof i.expires_at === 'number' && Number.isFinite(i.expires_at)) {
    return { entitlementId: i.entitlement_id, expiresAtMs: i.expires_at };
  }
  throw new LookupFailure('bad_response');
}

async function plusEntitlementId(
  config: LookupConfig,
  deps: LookupDeps,
  signal: AbortSignal,
): Promise<string> {
  const cached = deps.cache?.plusEntitlementIds.get(config.projectId);
  if (cached) return cached;

  const items = await listItems(entitlementsUrl(config.projectId), config, deps, signal, false);
  for (const item of items ?? []) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as { id?: unknown; lookup_key?: unknown };
    if (e.lookup_key === PLUS_ENTITLEMENT_ID && typeof e.id === 'string' && e.id !== '') {
      deps.cache?.plusEntitlementIds.set(config.projectId, e.id);
      return e.id;
    }
  }
  throw new LookupFailure('plus_entitlement_not_found');
}

async function runLookup(
  userId: string,
  config: LookupConfig,
  deps: LookupDeps,
  signal: AbortSignal,
): Promise<PlusLookup> {
  const items = await listItems(
    activeEntitlementsUrl(config.projectId, userId),
    config,
    deps,
    signal,
    true,
  );
  if (items === null) return { status: 'none' };

  const now = deps.now();
  const active = items
    .map(parseActiveEntitlement)
    .filter((e) => e.expiresAtMs === null || e.expiresAtMs > now);
  if (active.length === 0) return { status: 'none' };

  // The lookup key itself first, in case RevenueCat ever reports it here;
  // otherwise resolve 'plus' to RevenueCat's own id.
  let plus = active.filter((e) => e.entitlementId === PLUS_ENTITLEMENT_ID);
  if (plus.length === 0) {
    const id = await plusEntitlementId(config, deps, signal);
    plus = active.filter((e) => e.entitlementId === id);
  }
  if (plus.length === 0) return { status: 'none' };

  // A non-expiring grant outlasts any dated one; otherwise the latest expiry.
  const expiresAtMs = plus.some((e) => e.expiresAtMs === null)
    ? null
    : Math.max(...plus.map((e) => e.expiresAtMs as number));
  return {
    status: 'plus',
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    source: expiresAtMs === null ? 'lifetime' : 'annual',
  };
}

/**
 * Does RevenueCat say this Supabase user has Plus right now? Never throws.
 */
export async function lookupPlus(
  userId: string,
  config: LookupConfig | null,
  deps: LookupDeps,
): Promise<PlusLookup> {
  const log = deps.log ?? (() => undefined);
  const fail = (reason: LookupErrorReason): PlusLookup => {
    log(`[revenuecat-lookup] ${reason}`);
    return { status: 'error', reason };
  };

  // Before any URL is built, though the id is path-encoded regardless.
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) return fail('invalid_user_id');
  if (!config) return fail('not_configured');

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced as well as aborted: a fetch that ignores its signal still can't
  // hold the caller past the deadline.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LookupFailure('timeout'));
    }, deps.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([runLookup(userId, config, deps, controller.signal), deadline]);
  } catch (e) {
    return fail(e instanceof LookupFailure ? e.reason : 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** What to write to `entitlements` for a lookup's answer. */
export interface EntitlementWrite {
  userId: string;
  isPlus: boolean;
  source: EntitlementSource;
  expiresAt: string | null;
  /** The cursor `apply_entitlement_event` guards on (migration 004). */
  eventMs: number;
}

/**
 * The row a definite answer means: Plus with its expiry, or free. An error is
 * not an answer and has no row; the caller decides (the Coach keeps its 403,
 * the webhook asks RevenueCat to retry).
 */
export function writeFromLookup(
  userId: string,
  result: Exclude<PlusLookup, { status: 'error' }>,
  eventMs: number,
): EntitlementWrite {
  return result.status === 'plus'
    ? { userId, isPlus: true, source: result.source, expiresAt: result.expiresAt, eventMs }
    : { userId, isPlus: false, source: 'none', expiresAt: null, eventMs };
}

/** The arguments of `public.apply_entitlement_event` (migration 004). */
export function toRpcArgs(write: EntitlementWrite): {
  p_user_id: string;
  p_is_plus: boolean;
  p_source: EntitlementSource;
  p_expires_at: string | null;
  p_event_ms: number;
} {
  return {
    p_user_id: write.userId,
    p_is_plus: write.isPlus,
    p_source: write.source,
    p_expires_at: write.expiresAt,
    p_event_ms: write.eventMs,
  };
}

/**
 * Postgres foreign_key_violation (SQLSTATE 23503), as supabase-js reports an
 * RPC's error (`PostgrestError.code`). For `apply_entitlement_event` it means
 * the user is not in auth.users: a deleted account. Migration 004's function
 * already catches it and returns normally, so this is the second line, for a
 * live function that differs from the migration.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23503'
  );
}
