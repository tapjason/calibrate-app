// The guard for the under-13 rule (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md, "Every way data leaves the
// phone"). It reads the app's own source (every non-test .ts and .tsx under
// src/ and app/) with the TypeScript parser, so comments and strings don't
// count, and finds every place that can send something over the network. It
// checks:
//
//   1. The files that do equal NETWORK_FILES below, exactly. A new file that
//      sends anything fails here until it is gated and listed.
//   2. In each listed file, the count of each kind of network call equals
//      NETWORK_MARKER_COUNTS. Any new call in a listed file fails until
//      someone has looked at it and updates the count in the same change.
//   3. Outside the listed files, nothing imports a value from the Supabase
//      client module but `isSupabaseConfigured`, under any alias, by import,
//      require, import() or re-export: a file can't get hold of the client
//      without being listed.
//   4. Each listed file but the removal-only ones (account deletion) reads the
//      age store (`isLocalOnly`, `uploadsMayStart`, …).
//   5. In each, every entry point that can reach a request (itself, or through
//      a function of the same file) checks the rule, and checks it before the
//      first request: in its own body, or by calling a gate helper the file
//      lists in GATED_ENTRY_POINTS (a helper of its own that isn't listed
//      doesn't count, so a check that only logs can't pass for one). Entry
//      points are exported functions, and the methods and arrow properties of
//      objects and classes outside any function (a store's `create(…)`
//      object). UNGATED_EXPORTS says why the few that don't check are allowed
//      (sign-out and the refresh pause remove or stop, never send).
//   6. The entry points the design names check the rule in their own body,
//      before their first request (GATED_ENTRY_POINTS), and so do the queue
//      writer and billing's start.
//   7. Every exported `sign(In|Up)…` function in src/supabase/auth.ts opens
//      with exactly `const refused = await refuseWhenLocalOnly();` and
//      `if (refused) return refused;`, read from the syntax tree, not the text.
//
// What counts as a network call is in the marker lists' comments. Each check
// has fixture tests at the bottom, fed source text, showing it fails on the
// pattern it exists for. It is a structural check: the behavioural tests (one
// per gated module, with a client whose every property access throws) show
// the gates hold. What it can't see: a client reached through a parameter in a
// file that isn't listed and called by method names that aren't markers (an
// alias of `client.auth` calling `signOut`), or a gate whose result is
// computed but ignored inside the entry point itself.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import ts from 'typescript';

const ROOT = join(__dirname, '..', '..');

/**
 * Every file that can send something over the network, and what it sends.
 * Pinned: a file that starts or stops making requests must change this list.
 */
const NETWORK_FILES: Readonly<Record<string, string>> = {
  'src/ai/coach.ts':
    "the Coach request (session token, computed numbers): the empty result unless uploadsMayStart() (under the rule, or while Apple's answer is pending)",
  'src/ai/refine.ts': "Refine (dormant): null unless uploadsMayStart() (under the rule, or while Apple's answer is pending)",
  'src/analytics/flush.ts': 'usage counts: nothing unless uploadsMayStart()',
  'src/billing/revenuecat.ts': 'RevenueCat: no API key under the rule, so never configured',
  'src/store/authStore.ts': 'the stored session at launch (getSession, onAuthStateChange); its syncs refused under the rule',
  'src/supabase/account.ts': 'account deletion: open under the rule, it removes data',
  'src/supabase/auth.ts': 'sign-in and sign-up (refused under the rule), sign-out (open), the session refresh',
  'src/supabase/client.ts': 'the Supabase client: made with the session refresh off until uploads may start',
  'src/supabase/sync.ts': 'predictions: nothing under the rule; a sweep under way stops',
};

/**
 * How many of each kind of network call each listed file makes (labels as
 * `markersIn` names them). A change here is a change to what leaves the
 * phone: check the new call is gated (or that it only removes data), then
 * update the number in the same change. The failure message prints the file's
 * new counts, ready to paste.
 */
const NETWORK_MARKER_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'src/ai/coach.ts': { '.functions': 1, 'functions.invoke(': 1, 'getSupabaseClient(': 1 },
  'src/ai/refine.ts': { '.functions': 1, 'functions.invoke(': 1, 'getSupabaseClient(': 1 },
  'src/analytics/flush.ts': { '.from(…)': 1, 'getSupabaseClient(': 1 },
  // 13 since round 2, item 1: `Purchases.isAnonymous()` (a local read in the
  // SDK), reached only through configureBilling, logOutBilling and
  // settleOwedLogOut.
  'src/billing/revenuecat.ts': { Purchases: 13, "require('react-native-purchases')": 1 },
  'src/store/authStore.ts': { '.getSession(': 1, '.onAuthStateChange(': 1, 'getSupabaseClient(': 1 },
  'src/supabase/account.ts': {
    '.auth.getUser(': 1,
    '.functions': 1,
    '.getSession(': 1,
    'functions.invoke(': 1,
    'getSupabaseClient(': 1,
  },
  'src/supabase/auth.ts': {
    '.auth.signOut(': 2,
    '.exchangeCodeForSession(': 1,
    '.getSession(': 1,
    '.openAuthSessionAsync(': 1,
    '.signInWithIdToken(': 1,
    '.signInWithOAuth(': 1,
    '.signInWithPassword(': 1,
    '.signUp(': 1,
    '.startAutoRefresh(': 1,
    '.stopAutoRefresh(': 1,
    'getSupabaseClient(': 6,
    'peekSupabaseClient(': 2,
  },
  'src/supabase/client.ts': { 'createClient(': 1, "require('@supabase/supabase-js')": 1 },
  'src/supabase/sync.ts': { ".from('predictions')": 5, '.getSession(': 1, 'getSupabaseClient(': 1 },
};

/**
 * Files allowed to send without reading the age store, because they only
 * remove data (the main session's call 3). Nothing else belongs here.
 */
const REMOVAL_ONLY: ReadonlySet<string> = new Set(['src/supabase/account.ts']);

/** Entry points that reach a request without checking the rule, and why. */
const UNGATED_EXPORTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'src/supabase/auth.ts': {
    signOut: 'ends the session, online or on this phone alone: removes data',
    signOutLocal: 'ends the session after account deletion: removes data',
    discardStoredSession: 'removes a stored session from this phone; sends nothing',
    pauseSessionRefresh: 'stops the session refresh; sends nothing',
  },
  'src/store/authStore.ts': {
    'useAuthStore.initialize':
      'reads the stored session at launch (getSession, onAuthStateChange), before Apple can answer: a session ' +
      'within its expiry margin is refreshed by that read, as by the client\'s own start (the disclosed ' +
      'residual, src/supabase/client.ts); every sync it starts goes through syncForUser, refused under the rule',
  },
};

/**
 * Entry points the design names, each checking the rule in its own body
 * before its first request. These are also the file's gate helpers: another
 * function of the same file that calls one of them checks the rule through it.
 */
const GATED_ENTRY_POINTS: Readonly<Record<string, readonly string[]>> = {
  'src/supabase/sync.ts': [
    'syncNow',
    'runSync',
    'pushNow',
    'backfillOffsets',
    'pullRemote',
    'pushDirty',
    'pushDeletions',
    'pushDeletionsCounted',
    'sessionStillFor',
    'whileNotLocalOnly',
  ],
  'src/ai/coach.ts': ['fetchCoachInsights'],
  'src/ai/refine.ts': ['refinePrediction'],
  'src/analytics/flush.ts': ['flushEvents', 'run', 'maySend'],
  'src/analytics/track.ts': ['track'],
  'src/billing/revenuecat.ts': ['apiKeyForPlatform'],
  'src/billing/init.ts': ['startBilling', 'ensureBillingStarted', 'refreshBilling'],
  'src/supabase/auth.ts': ['refuseWhenLocalOnly', 'resumeSessionRefresh'],
  'src/supabase/client.ts': ['getSupabaseClient'],
  'src/store/authStore.ts': ['syncForUser'],
};

/**
 * Functions where the rule's check isn't a guard before a request, so the
 * before-the-first-request order doesn't apply, and why.
 */
const ORDER_EXEMPT: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'src/supabase/client.ts': {
    getSupabaseClient:
      'the rule sets how the client is made (its session refresh off until uploads may start); making it sends nothing by itself',
  },
};

/** What checking the rule looks like in a function body. */
const GATE_CALLS: ReadonlySet<string> = new Set(['isLocalOnly', 'uploadsMayStart', 'refuseWhenLocalOnly']);

// ----------------------------------------------------------------------------
// What counts as a network call
// ----------------------------------------------------------------------------

/** Methods that send, or can send, or hand out the client, wherever they are called. */
const NETWORK_METHODS: ReadonlySet<string> = new Set([
  // Supabase: PostgREST, Edge Functions, auth, realtime.
  'rpc',
  'channel',
  'exchangeCodeForSession',
  'verifyOtp',
  'resetPasswordForEmail',
  'updateUser',
  'refreshSession',
  'setSession',
  'getSession',
  'onAuthStateChange',
  'startAutoRefresh',
  'stopAutoRefresh',
  'signUp',
  'signInWithOAuth',
  'signInWithIdToken',
  'signInWithPassword',
  'signInWithOtp',
  'signInWithSSO',
  'signInWithWeb3',
  'signInAnonymously',
  'linkIdentity',
  'unlinkIdentity',
  'reauthenticate',
  // The client module's hand-outs, called through a namespace import.
  'getSupabaseClient',
  'peekSupabaseClient',
  'createClient',
  // The system web sign-in sheet; push tokens (Expo's and Apple's servers).
  'openAuthSessionAsync',
  'getExpoPushTokenAsync',
  'getDevicePushTokenAsync',
  'sendBeacon',
]);

/** Methods that send when called on a Supabase auth client (`….auth.x(…)`). */
const AUTH_METHODS: ReadonlySet<string> = new Set(['signOut', 'getUser']);

/** Functions that send, or hand out the client that does, when called by name. */
const NETWORK_FUNCTIONS: ReadonlySet<string> = new Set([
  'fetch',
  'getSupabaseClient',
  'peekSupabaseClient',
  'createClient',
]);

/** The client module's exports that hand out the client, followed through any import alias. */
const CLIENT_HANDOUTS: ReadonlySet<string> = new Set(['getSupabaseClient', 'peekSupabaseClient']);

/** The one value from the client module any file may import: it says whether accounts exist. */
const CLIENT_IMPORTS_ALLOWED_ANYWHERE: ReadonlySet<string> = new Set(['isSupabaseConfigured']);

/** The Supabase client module, as a path from the repo root without its extension. */
const CLIENT_MODULE = 'src/supabase/client';

/** Constructors that open a connection. */
const NETWORK_CONSTRUCTORS: ReadonlySet<string> = new Set(['XMLHttpRequest', 'WebSocket', 'EventSource']);

/** Identifiers that are an SDK that sends (RevenueCat's). */
const NETWORK_IDENTIFIERS: ReadonlySet<string> = new Set(['Purchases']);

/** Modules whose import or require means requests. */
const NETWORK_MODULES: readonly RegExp[] = [
  /^react-native-purchases$/,
  /^@supabase\/supabase-js$/,
  /^axios$/,
  /^expo-updates$/,
  /^@sentry\//,
  /^@react-native-firebase\//,
  /^posthog/,
  /^mixpanel/,
  /^@amplitude\//,
  /^@segment\//,
];

/** Receivers whose `.from(…)` is not a Supabase table. Any other receiver's is, whatever its argument. */
const NOT_A_TABLE: ReadonlySet<string> = new Set([
  'Array',
  'Buffer',
  'Object',
  'Set',
  'Map',
  'String',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
]);

// ----------------------------------------------------------------------------
// Reading the source
// ----------------------------------------------------------------------------

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

function rel(path: string): string {
  return relative(ROOT, path).split(sep).join('/');
}

/** A source file from text, named as a path from the repo root (fixtures use made-up paths). */
function sourceOf(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const parsed = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    sf = sourceOf(file, readFileSync(join(ROOT, file), 'utf8'));
    parsed.set(file, sf);
  }
  return sf;
}

function isStringArg(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((el) => el.isTypeOnly);
}

/** Whether a module specifier in `fromFile` names the Supabase client module. */
function namesTheClientModule(fromFile: string, spec: string): boolean {
  if (spec === '@/supabase/client') return true;
  if (!spec.startsWith('.')) return false;
  const dir = posix.dirname(fromFile);
  return posix.normalize(posix.join(dir, spec)).replace(/\.tsx?$/, '') === CLIENT_MODULE;
}

const aliasCache = new WeakMap<ts.SourceFile, ReadonlyMap<string, string>>();

/** Local names bound to the client module's hand-outs (`getSupabaseClient as sb` → sb). */
function clientAliases(sf: ts.SourceFile): ReadonlyMap<string, string> {
  const cached = aliasCache.get(sf);
  if (cached) return cached;
  const aliases = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!namesTheClientModule(sf.fileName, stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (CLIENT_HANDOUTS.has(imported) && !el.isTypeOnly) aliases.set(el.name.text, imported);
    }
  }
  aliasCache.set(sf, aliases);
  return aliases;
}

/**
 * Walk the network markers inside `root` in source order, each as a short
 * label with the node it is. Type positions are skipped.
 */
function walkMarkers(root: ts.Node, onMarker: (label: string, node: ts.Node) => void): void {
  const aliases = clientAliases(root.getSourceFile());
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
    const found = (label: string) => onMarker(label, node);
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImport(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (NETWORK_MODULES.some((re) => re.test(spec))) found(`import '${spec}'`);
      }
      return;
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      if (NETWORK_CONSTRUCTORS.has(node.expression.text)) found(`new ${node.expression.text}(`);
    }
    // The Edge Functions client, read off any receiver or taken apart.
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'functions') found('.functions');
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const key = node.propertyName ?? node.name;
      if (ts.isIdentifier(key) && key.text === 'functions') found('{ functions }');
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      if (callee.kind === ts.SyntaxKind.ImportKeyword && isStringArg(first)) {
        if (NETWORK_MODULES.some((re) => re.test(first.text))) found(`import('${first.text}')`);
      } else if (ts.isIdentifier(callee)) {
        if (callee.text === 'require' && isStringArg(first)) {
          if (NETWORK_MODULES.some((re) => re.test(first.text))) found(`require('${first.text}')`);
        } else if (NETWORK_FUNCTIONS.has(callee.text)) {
          found(`${callee.text}(`);
        } else if (aliases.has(callee.text)) {
          found(`${aliases.get(callee.text)}(`);
        }
      } else if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        const recv = callee.expression;
        if (NETWORK_METHODS.has(name)) found(`.${name}(`);
        else if (name === 'invoke' && ts.isPropertyAccessExpression(recv) && recv.name.text === 'functions') {
          found('functions.invoke(');
        } else if (
          AUTH_METHODS.has(name) &&
          ((ts.isPropertyAccessExpression(recv) && recv.name.text === 'auth') ||
            (ts.isIdentifier(recv) && /auth$/i.test(recv.text) && recv.text !== 'auth'))
        ) {
          found(`.auth.${name}(`);
        } else if (name === 'fetch' && ts.isIdentifier(recv) && ['globalThis', 'window', 'global', 'self'].includes(recv.text)) {
          found(`${recv.text}.fetch(`);
        } else if (name === 'from' && !(ts.isIdentifier(recv) && NOT_A_TABLE.has(recv.text))) {
          found(isStringArg(first) ? `.from('${first.text}')` : '.from(…)');
        }
      }
    }
    if (ts.isIdentifier(node) && NETWORK_IDENTIFIERS.has(node.text)) found(node.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/** The network markers inside `root`, as short labels, in source order. */
function markersIn(root: ts.Node): string[] {
  const found: string[] = [];
  walkMarkers(root, (label) => found.push(label));
  return found;
}

/** Where the first network marker inside `root` starts, or Infinity. */
function firstMarkerAt(root: ts.Node): number {
  let first = Number.POSITIVE_INFINITY;
  walkMarkers(root, (_label, node) => {
    first = Math.min(first, node.getStart());
  });
  return first;
}

/** How many of each marker a file has, keys sorted. */
function markerCounts(sf: ts.SourceFile): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of markersIn(sf).sort()) counts[label] = (counts[label] ?? 0) + 1;
  return counts;
}

/** The lines each marker label is found on in a file, in source order. */
function markerLines(sf: ts.SourceFile): Map<string, number[]> {
  const lines = new Map<string, number[]>();
  walkMarkers(sf, (label, node) => {
    const at = lines.get(label) ?? [];
    at.push(lineOf(sf, node.getStart()));
    lines.set(label, at);
  });
  return lines;
}

/** An entry point or a helper: a top-level function, or a method or arrow property of an object or class. */
interface Fn {
  name: string;
  node: ts.Node;
  exported: boolean;
  /** The body alone, for the opening-statements check. */
  body: ts.ConciseBody | undefined;
}

function hasExport(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function topFunctions(sf: ts.SourceFile): Fn[] {
  const out: Fn[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({ name: stmt.name.text, node: stmt, exported: hasExport(stmt), body: stmt.body });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (ts.isIdentifier(decl.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: decl.name.text, node: init, exported: hasExport(stmt), body: init.body });
        }
      }
    }
  }
  return out;
}

function memberName(name: ts.PropertyName | undefined): string {
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name))) return name.text;
  return '[computed]';
}

/**
 * The methods and arrow or function properties of objects and classes that
 * sit outside every top-level function (a store's `create(…)` object, a
 * module-level object or class), each named by where it sits
 * (`useAuthStore.initialize`). Each counts as an entry point: whoever holds
 * the object can call it. Objects inside a top-level function (an SDK seam
 * built and returned by one) are covered by that function's own analysis.
 */
function memberFunctions(sf: ts.SourceFile, tops: readonly Fn[]): Fn[] {
  const topNodes = new Set(tops.map((fn) => fn.node));
  const out: Fn[] = [];
  const visit = (node: ts.Node, path: readonly string[]): void => {
    if (topNodes.has(node)) return;
    let here = path;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) here = [node.name.text];
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) here = [node.name.text];
    const members: readonly ts.Node[] | null = ts.isObjectLiteralExpression(node)
      ? node.properties
      : ts.isClassDeclaration(node) || ts.isClassExpression(node)
        ? node.members
        : null;
    if (members === null) {
      ts.forEachChild(node, (child) => visit(child, here));
      return;
    }
    const prefix = here.length > 0 ? here : ['<object>'];
    for (const member of members) {
      const label = [...prefix, memberName((member as ts.NamedDeclaration).name as ts.PropertyName | undefined)];
      if ((ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && member.body) {
        out.push({ name: label.join('.'), node: member, exported: true, body: member.body });
        continue;
      }
      const init =
        ts.isPropertyAssignment(member) || ts.isPropertyDeclaration(member) ? member.initializer : undefined;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        out.push({ name: label.join('.'), node: init, exported: true, body: init.body });
        continue;
      }
      ts.forEachChild(member, (child) => visit(child, label));
    }
  };
  visit(sf, []);
  return out;
}

/** Every entry point and helper of a file: its top-level functions, then its object and class members. */
function functionsOf(sf: ts.SourceFile): Fn[] {
  const tops = topFunctions(sf);
  return [...tops, ...memberFunctions(sf, tops)];
}

/** Names called as plain functions inside `root`, each with where its first call starts. */
function callsIn(root: ts.Node): Map<string, number> {
  const names = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const at = node.getStart();
      if (!names.has(name) || (names.get(name) as number) > at) names.set(name, at);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** Everything reachable from `start` through the file's own functions, `start` included. */
function reach(start: string, calls: ReadonlyMap<string, ReadonlyMap<string, number>>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const next = queue.pop() as string;
    for (const callee of (calls.get(next) ?? new Map()).keys()) {
      if (calls.has(callee) && !seen.has(callee)) {
        seen.add(callee);
        queue.push(callee);
      }
    }
  }
  return seen;
}

/** A file's analysis: its functions, what each calls, which can send, and its gate helpers. */
interface FileModel {
  fns: Fn[];
  byName: Map<string, Fn>;
  calls: Map<string, Map<string, number>>;
  /** Functions with a network marker in their own node. */
  sends: Set<string>;
  /** Functions that can reach a request, themselves or through the file's functions. */
  reachesSend: Set<string>;
  /** The listed entry points that call a gate directly: calling one checks the rule. */
  helpers: Set<string>;
}

function modelOf(sf: ts.SourceFile, listedHelpers: readonly string[]): FileModel {
  const fns = functionsOf(sf);
  const byName = new Map(fns.map((fn) => [fn.name, fn]));
  const calls = new Map(fns.map((fn) => [fn.name, callsIn(fn.node)]));
  const sends = new Set(fns.filter((fn) => markersIn(fn.node).length > 0).map((fn) => fn.name));
  const reachesSend = new Set(fns.filter((fn) => [...reach(fn.name, calls)].some((n) => sends.has(n))).map((fn) => fn.name));
  const helpers = new Set(
    listedHelpers.filter((name) => [...(calls.get(name) ?? new Map()).keys()].some((n) => GATE_CALLS.has(n))),
  );
  return { fns, byName, calls, sends, reachesSend, helpers };
}

/** Where `fn` first checks the rule (a gate, or a listed gate helper), or Infinity. */
function firstGateAt(fn: Fn, model: FileModel): number {
  let first = Number.POSITIVE_INFINITY;
  for (const [name, at] of model.calls.get(fn.name) ?? new Map<string, number>()) {
    if (GATE_CALLS.has(name) || (model.helpers.has(name) && name !== fn.name)) first = Math.min(first, at);
  }
  return first;
}

/** Where `fn` first sends: a marker in its own node, or a call to a function that can. */
function firstSendAt(fn: Fn, model: FileModel): number {
  let first = firstMarkerAt(fn.node);
  for (const [name, at] of model.calls.get(fn.name) ?? new Map<string, number>()) {
    if (name !== fn.name && model.reachesSend.has(name)) first = Math.min(first, at);
  }
  return first;
}

/** Line of a position, for messages. */
function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

// ----------------------------------------------------------------------------
// The checks, as functions of source, so fixtures can feed them
// ----------------------------------------------------------------------------

/**
 * Check 2: a listed file's marker counts against its pinned ones; empty when
 * they match. On a change it says where every marker in the file is, the
 * changed kinds first, so whoever re-pins can find the new call.
 */
function countOffenders(file: string, sf: ts.SourceFile, pinned: Readonly<Record<string, number>> | undefined): string[] {
  const actual = markerCounts(sf);
  const want = pinned ?? {};
  const labels = [...new Set([...Object.keys(actual), ...Object.keys(want)])].sort();
  const changedLabels = labels.filter((label) => (actual[label] ?? 0) !== (want[label] ?? 0));
  if (changedLabels.length === 0) return [];
  const changed = changedLabels.map((label) => `${label} ${want[label] ?? 0} → ${actual[label] ?? 0}`);
  const lines = markerLines(sf);
  const where = (label: string) => {
    const at = lines.get(label) ?? [];
    return at.length === 0 ? `${label}: none left` : `${label}: line${at.length > 1 ? 's' : ''} ${at.join(', ')}`;
  };
  const unchanged = labels.filter((label) => !changedLabels.includes(label) && lines.has(label));
  return [
    `${file}: ${changed.join(', ')}\n` +
      `    changed, found at: ${changedLabels.map(where).join('; ')}\n` +
      (unchanged.length > 0 ? `    unchanged, found at: ${unchanged.map(where).join('; ')}\n` : '') +
      `    new counts: '${file}': ${JSON.stringify(actual)},`,
  ];
}

/** Check 3: value imports from the client module, in a file that isn't listed. */
function clientImportOffenders(file: string, sf: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (namesTheClientModule(file, node.moduleSpecifier.text) && !isTypeOnlyImport(node)) {
        const clause = node.importClause;
        if (clause?.name) found.push(`default import as ${clause.name.text}`);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) found.push(`* as ${bindings.name.text}`);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            const imported = (el.propertyName ?? el.name).text;
            if (el.isTypeOnly || CLIENT_IMPORTS_ALLOWED_ANYWHERE.has(imported)) continue;
            found.push(el.propertyName ? `${imported} as ${el.name.text}` : imported);
          }
        }
      }
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (namesTheClientModule(file, node.moduleSpecifier.text) && !node.isTypeOnly) found.push('a re-export');
      return;
    }
    if (ts.isCallExpression(node) && isStringArg(node.arguments[0])) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamic) && namesTheClientModule(file, node.arguments[0].text)) {
        found.push(isRequire ? 'require(…)' : 'import(…)');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.map((what) => `${file}: ${what}`);
}

/** Check 5: entry points that can reach a request without checking the rule first. */
function ungatedOffenders(
  file: string,
  sf: ts.SourceFile,
  opts: { allowed?: Readonly<Record<string, string>>; helpers?: readonly string[]; orderExempt?: Readonly<Record<string, string>> } = {},
): string[] {
  const allowed = opts.allowed ?? {};
  const exempt = opts.orderExempt ?? {};
  const model = modelOf(sf, opts.helpers ?? []);
  const offenders: string[] = [];
  for (const fn of model.fns) {
    if (!fn.exported || fn.name.startsWith('__') || fn.name.split('.').some((p) => p.startsWith('__'))) continue;
    if (fn.name in allowed || !model.reachesSend.has(fn.name)) continue;
    const gate = firstGateAt(fn, model);
    if (gate === Number.POSITIVE_INFINITY) {
      offenders.push(`${file}: ${fn.name} (line ${lineOf(sf, fn.node.getStart())}) never checks the rule`);
      continue;
    }
    const send = firstSendAt(fn, model);
    if (!(fn.name in exempt) && send < gate) {
      offenders.push(
        `${file}: ${fn.name} sends (line ${lineOf(sf, send)}) before it checks the rule (line ${lineOf(sf, gate)})`,
      );
    }
  }
  return offenders;
}

/** Check 6: named entry points that don't check the rule in their own body, before their first request. */
function entryPointOffenders(
  file: string,
  sf: ts.SourceFile,
  names: readonly string[],
  orderExempt: Readonly<Record<string, string>> = {},
): string[] {
  const model = modelOf(sf, names);
  const offenders: string[] = [];
  for (const name of names) {
    const fn = model.byName.get(name);
    if (!fn) {
      offenders.push(`${file}: ${name} (not found)`);
      continue;
    }
    const gate = firstGateAt(fn, model);
    if (gate === Number.POSITIVE_INFINITY) {
      offenders.push(`${file}: ${name} doesn't check the rule in its own body`);
      continue;
    }
    if (!(name in orderExempt) && firstSendAt(fn, model) < gate) {
      offenders.push(`${file}: ${name} sends before it checks the rule`);
    }
  }
  return offenders;
}

/** Whether a statement is exactly `return <name>;`, alone or in a block. */
function returnsExactly(stmt: ts.Statement, name: string): boolean {
  const only = ts.isBlock(stmt) ? (stmt.statements.length === 1 ? stmt.statements[0] : null) : stmt;
  return (
    only !== null &&
    ts.isReturnStatement(only) &&
    only.expression !== undefined &&
    ts.isIdentifier(only.expression) &&
    only.expression.text === name
  );
}

/**
 * Whether a body opens with `const <x> = await refuseWhenLocalOnly();` then
 * `if (<x>) return <x>;`, read from the syntax tree: the call is the whole
 * initializer, awaited, with no arguments, outside any condition, and its
 * refusal is returned straight away.
 */
function opensWithTheRefusal(body: ts.ConciseBody | undefined): boolean {
  if (!body || !ts.isBlock(body) || body.statements.length < 2) return false;
  const [first, second] = body.statements;
  if (!ts.isVariableStatement(first)) return false;
  const list = first.declarationList;
  if ((list.flags & ts.NodeFlags.Const) === 0 || list.declarations.length !== 1) return false;
  const decl = list.declarations[0];
  if (!ts.isIdentifier(decl.name) || !decl.initializer || !ts.isAwaitExpression(decl.initializer)) return false;
  const call = decl.initializer.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
  if (call.expression.text !== 'refuseWhenLocalOnly' || call.arguments.length !== 0) return false;
  const name = decl.name.text;
  return (
    ts.isIfStatement(second) &&
    second.elseStatement === undefined &&
    ts.isIdentifier(second.expression) &&
    second.expression.text === name &&
    returnsExactly(second.thenStatement, name)
  );
}

/** Check 7: exported sign-in and sign-up functions that don't open with the refusal. */
function signInOpeningOffenders(sf: ts.SourceFile): string[] {
  return topFunctions(sf)
    .filter((fn) => fn.exported && /^sign(In|Up)/.test(fn.name) && !opensWithTheRefusal(fn.body))
    .map((fn) => fn.name);
}

/** Whether the file has a value import from the age store. */
function importsTheAgeStore(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      !isTypeOnlyImport(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      (stmt.moduleSpecifier.text === '@/store/ageStore' ||
        (sf.fileName.startsWith('src/store/') && stmt.moduleSpecifier.text === './ageStore')),
  );
}

const HOW_TO_FIX =
  'Gate it on the under-13 rule (roadmap D70; docs/design/research/under-13-2026-11.md): before any ' +
  'request, return when isLocalOnly() (from @/store/ageStore), or for an automatic upload at launch ' +
  'send nothing unless uploadsMayStart(); a sign-in starts with refuseWhenLocalOnly(). Then list the ' +
  'file in NETWORK_FILES in src/age/egress.test.ts with what it sends, pin its NETWORK_MARKER_COUNTS, ' +
  'and add a behavioural test with a client whose every property access throws. Only a path that ' +
  'removes data (account deletion, sign-out) may skip the gate, and it goes in REMOVAL_ONLY or ' +
  'UNGATED_EXPORTS with the reason.';

// ----------------------------------------------------------------------------
// The checks, on the app
// ----------------------------------------------------------------------------

const ALL_FILES = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))].map(rel).sort();

describe('every way data leaves the phone is gated by the under-13 rule (D70)', () => {
  it('finds the files that make network calls, and they are exactly the listed ones', () => {
    const found = new Map<string, string[]>();
    for (const file of ALL_FILES) {
      const markers = markersIn(parse(file));
      if (markers.length > 0) found.set(file, markers);
    }
    const listed = Object.keys(NETWORK_FILES).sort();
    const unexpected = [...found.keys()].filter((file) => !listed.includes(file));
    const missing = listed.filter((file) => !found.has(file));
    if (unexpected.length > 0) {
      throw new Error(
        `These files make network calls but aren't in NETWORK_FILES:\n${unexpected
          .map((file) => `  ${file}: ${[...new Set(found.get(file))].join(', ')}`)
          .join('\n')}\n${HOW_TO_FIX}`,
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `These files are in NETWORK_FILES but no longer make network calls: ${missing.join(', ')}. ` +
          'Take them off the list (and off NETWORK_MARKER_COUNTS, REMOVAL_ONLY, UNGATED_EXPORTS, ' +
          'GATED_ENTRY_POINTS and ORDER_EXEMPT if there).',
      );
    }
    expect([...found.keys()].sort()).toEqual(listed);
  });

  it('each listed file makes exactly the pinned number of each kind of network call', () => {
    const offenders = Object.keys(NETWORK_FILES).flatMap((file) =>
      countOffenders(file, parse(file), NETWORK_MARKER_COUNTS[file]),
    );
    const stale = Object.keys(NETWORK_MARKER_COUNTS).filter((file) => !(file in NETWORK_FILES));
    if (offenders.length > 0 || stale.length > 0) {
      throw new Error(
        `The network calls in these listed files changed:\n  ${offenders.join('\n  ')}\n` +
          (stale.length > 0 ? `Pinned but not listed: ${stale.join(', ')}.\n` : '') +
          'Each new call must check the under-13 rule before it sends (or only remove data). Once you have ' +
          'checked that, paste the new counts into NETWORK_MARKER_COUNTS in src/age/egress.test.ts in the ' +
          'same change, so the reviewer sees what now leaves the phone.',
      );
    }
  });

  it('outside the listed files, nothing takes a value from the Supabase client module but isSupabaseConfigured', () => {
    const offenders = ALL_FILES.filter((file) => !(file in NETWORK_FILES)).flatMap((file) =>
      clientImportOffenders(file, parse(file)),
    );
    if (offenders.length > 0) {
      throw new Error(
        `These files take the Supabase client (or something from its module) without being listed:\n  ${offenders.join(
          '\n  ',
        )}\nA file that can reach the client can send. Use isSupabaseConfigured() only, or route the call ` +
          `through a listed, gated module.\n${HOW_TO_FIX}`,
      );
    }
  });

  it('scans enough of the app for the list to mean something', () => {
    expect(ALL_FILES.length).toBeGreaterThan(100);
    expect(ALL_FILES).toContain('app/_layout.tsx');
    // A marker in a comment or a string isn't a call.
    const sf = sourceOf(
      'probe.ts',
      "// fetch('x') and client.functions.invoke('y')\nconst s = \"getSupabaseClient()\";\nArray.from('ab');\nFloat32Array.from(xs);",
    );
    expect(markersIn(sf)).toEqual([]);
    const live = sourceOf(
      'probe2.ts',
      "import type { SupabaseClient } from '@supabase/supabase-js';\nawait fetch(u);\nclient.from('predictions');\nsupabase.auth.signOut();\nnew WebSocket(u);",
    );
    expect(markersIn(live)).toEqual(['fetch(', ".from('predictions')", '.auth.signOut(', 'new WebSocket(']);
  });

  it('each listed file reads the age store, but the ones that only remove data', () => {
    const offenders = Object.keys(NETWORK_FILES).filter(
      (file) => !REMOVAL_ONLY.has(file) && !importsTheAgeStore(parse(file)),
    );
    if (offenders.length > 0) {
      throw new Error(`These files send without reading the age store: ${offenders.join(', ')}.\n${HOW_TO_FIX}`);
    }
    // The queue writer and billing's start read it too.
    for (const file of ['src/analytics/track.ts', 'src/billing/init.ts', 'src/age/localOnly.ts']) {
      expect({ file, reads: importsTheAgeStore(parse(file)) }).toEqual({ file, reads: true });
    }
    expect([...REMOVAL_ONLY]).toEqual(['src/supabase/account.ts']);
  });

  it('every entry point that can reach a request checks the rule, before the request', () => {
    const offenders: string[] = [];
    for (const file of Object.keys(NETWORK_FILES)) {
      if (REMOVAL_ONLY.has(file)) continue;
      offenders.push(
        ...ungatedOffenders(file, parse(file), {
          allowed: UNGATED_EXPORTS[file],
          helpers: GATED_ENTRY_POINTS[file],
          orderExempt: ORDER_EXEMPT[file],
        }),
      );
    }
    if (offenders.length > 0) {
      throw new Error(
        `These entry points can send without checking the rule first:\n  ${offenders.join('\n  ')}\n` +
          'Check the rule in the function itself, before the request, or call a gate helper listed for ' +
          `the file in GATED_ENTRY_POINTS.\n${HOW_TO_FIX}`,
      );
    }
    // The allowed and exempt ones are real: a stale entry fails.
    for (const table of [UNGATED_EXPORTS, ORDER_EXEMPT]) {
      for (const [file, names] of Object.entries(table)) {
        const entry = functionsOf(parse(file))
          .filter((fn) => fn.exported)
          .map((fn) => fn.name);
        for (const name of Object.keys(names)) expect({ file, name, entry: entry.includes(name) }).toEqual({ file, name, entry: true });
      }
    }
  });

  it('the entry points the design names check the rule in their own body, before their first request', () => {
    const offenders = Object.entries(GATED_ENTRY_POINTS).flatMap(([file, names]) =>
      entryPointOffenders(file, parse(file), names, ORDER_EXEMPT[file]),
    );
    if (offenders.length > 0) {
      throw new Error(`These entry points don't check the rule first in their own body:\n  ${offenders.join('\n  ')}\n${HOW_TO_FIX}`);
    }
  });

  it('every exported sign-in and sign-up function opens with the refusal', () => {
    const sf = parse('src/supabase/auth.ts');
    const names = topFunctions(sf)
      .filter((fn) => fn.exported && /^sign(In|Up)/.test(fn.name))
      .map((fn) => fn.name);
    expect(names).toEqual(
      expect.arrayContaining(['signInWithApple', 'signInWithGoogle', 'signInWithEmail', 'signUpWithEmail']),
    );
    const offenders = signInOpeningOffenders(sf);
    if (offenders.length > 0) {
      throw new Error(
        `These sign-in functions don't open with the refusal: ${offenders.join(', ')}. ` +
          'Make `const refused = await refuseWhenLocalOnly();` and `if (refused) return refused;` their first two statements.',
      );
    }
  });
});

// ----------------------------------------------------------------------------
// The guard fails on what it exists for (fixtures: source text, no real files)
// ----------------------------------------------------------------------------

describe('the guard catches the patterns that used to slip past it', () => {
  it('check 2: a new call in a listed file changes its counts', () => {
    const before = sourceOf('src/fake/listed.ts', "import { isLocalOnly } from '@/store/ageStore';\nclient.from('predictions');");
    const pinned = markerCounts(before);
    expect(countOffenders('src/fake/listed.ts', before, pinned)).toEqual([]);

    const after = sourceOf(
      'src/fake/listed.ts',
      "import { isLocalOnly } from '@/store/ageStore';\nclient.from('predictions');\nclient.from('predictions').insert(r);",
    );
    const offenders = countOffenders('src/fake/listed.ts', after, pinned);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain(".from('predictions') 1 → 2");
    expect(offenders[0]).toContain('new counts');
    // Where each one is, so whoever re-pins sees the new call (round 2, item 6).
    expect(offenders[0]).toContain("changed, found at: .from('predictions'): lines 2, 3");
  });

  it('check 2: the message names the line of every marker, changed kinds and unchanged ones, and a kind now gone', () => {
    const pinned = { '.functions': 1, 'functions.invoke(': 2, 'getSupabaseClient(': 1, 'fetch(': 1 };
    const after = sourceOf(
      'src/fake/listed.ts',
      ["const c = getSupabaseClient();", "c.functions.invoke('a');", "c.functions.invoke('b');"].join('\n'),
    );
    const [message] = countOffenders('src/fake/listed.ts', after, pinned);
    expect(message).toContain('.functions 1 → 2');
    expect(message).toContain('fetch( 1 → 0');
    expect(message).toContain('changed, found at: .functions: lines 2, 3; fetch(: none left');
    expect(message).toContain('unchanged, found at: functions.invoke(: lines 2, 3; getSupabaseClient(: line 1');
  });

  it('check 3: the client taken under an alias, by namespace, require, import() or re-export, outside the listed files', () => {
    const cases: Array<[string, string]> = [
      ["import { getSupabaseClient as sb } from '@/supabase/client';", 'getSupabaseClient as sb'],
      ["import { peekSupabaseClient } from '@/supabase/client';", 'peekSupabaseClient'],
      ["import * as c from '@/supabase/client';", '* as c'],
      ["import { getSupabaseClient } from '../supabase/client';", 'getSupabaseClient'],
      ["const c = require('@/supabase/client');", 'require(…)'],
      ["const c = await import('@/supabase/client');", 'import(…)'],
      ["export { getSupabaseClient } from '@/supabase/client';", 'a re-export'],
    ];
    for (const [text, what] of cases) {
      expect(clientImportOffenders('src/fake/new.ts', sourceOf('src/fake/new.ts', text))).toEqual([`src/fake/new.ts: ${what}`]);
    }
    // What stays allowed: isSupabaseConfigured, types, and another module's own ./client.
    for (const text of [
      "import { isSupabaseConfigured } from '@/supabase/client';",
      "import type { SupabaseClient } from '@/supabase/client';",
      "import { getDb } from './client';",
    ]) {
      expect(clientImportOffenders('src/db/fake.ts', sourceOf('src/db/fake.ts', text))).toEqual([]);
    }
  });

  it("an aliased hand-out is still a marker, and peekSupabaseClient()?.from(T) is one too", () => {
    const aliased = sourceOf(
      'src/fake/new.ts',
      "import { getSupabaseClient as sb } from '@/supabase/client';\nconst c = sb();",
    );
    expect(markersIn(aliased)).toEqual(['getSupabaseClient(']);
    const peeked = sourceOf('src/fake/new.ts', 'peekSupabaseClient()?.from(T).insert(r);');
    expect(markersIn(peeked).sort()).toEqual(['.from(…)', 'peekSupabaseClient(']);
  });

  it('a table named by a variable on an injected client is a marker, and Array.from(x) still is not', () => {
    expect(markersIn(sourceOf('src/fake/new.ts', 'deps.client.from(TABLE).insert(rows);'))).toEqual(['.from(…)']);
    expect(markersIn(sourceOf('src/fake/new.ts', 'client.from(table);'))).toEqual(['.from(…)']);
    expect(markersIn(sourceOf('src/fake/new.ts', 'Array.from(xs); Uint8Array.from(b); Buffer.from(s);'))).toEqual([]);
  });

  it('the Edge Functions client read off or taken apart is a marker', () => {
    expect(markersIn(sourceOf('src/fake/new.ts', "const f = client.functions; f.invoke('coach');"))).toEqual(['.functions']);
    expect(markersIn(sourceOf('src/fake/new.ts', "const { functions } = client; functions.invoke('coach');"))).toEqual([
      '{ functions }',
    ]);
  });

  it("check 5: a network action written as a method or arrow property in a store's create(…) object", () => {
    const store = sourceOf(
      'src/fake/store.ts',
      [
        "import { create } from 'zustand';",
        "import { isLocalOnly } from '@/store/ageStore';",
        'export const useThing = create(() => ({',
        "  push: async (rows) => { await fetch('https://x.example', { body: rows }); },",
        "  async pull() { await fetch('https://x.example'); },",
        "  safe: async () => { if (isLocalOnly()) return; await fetch('https://x.example'); },",
        '  local: () => 1,',
        '}));',
      ].join('\n'),
    );
    const offenders = ungatedOffenders('src/fake/store.ts', store);
    expect(offenders).toHaveLength(2);
    expect(offenders[0]).toMatch(/^src\/fake\/store\.ts: useThing\.push .*never checks the rule/);
    expect(offenders[1]).toMatch(/^src\/fake\/store\.ts: useThing\.pull .*never checks the rule/);
  });

  it('check 5: a gate call after the request', () => {
    const late = sourceOf(
      'src/fake/late.ts',
      "import { isLocalOnly } from '@/store/ageStore';\nexport async function send(r) {\n  await fetch('https://x.example', { body: r });\n  if (isLocalOnly()) return;\n}",
    );
    expect(ungatedOffenders('src/fake/late.ts', late)).toEqual([
      'src/fake/late.ts: send sends (line 3) before it checks the rule (line 4)',
    ]);
  });

  it('check 5: a gate only in an unlisted helper of the file does not count; a listed one does', () => {
    const text = [
      "import { isLocalOnly } from '@/store/ageStore';",
      'function note() { console.log(isLocalOnly()); }',
      "export async function send(r) { note(); await fetch('https://x.example', { body: r }); }",
    ].join('\n');
    expect(ungatedOffenders('src/fake/helper.ts', sourceOf('src/fake/helper.ts', text))).toEqual([
      'src/fake/helper.ts: send (line 3) never checks the rule',
    ]);
    // Listed in GATED_ENTRY_POINTS (and so reviewed), the helper counts.
    expect(ungatedOffenders('src/fake/helper.ts', sourceOf('src/fake/helper.ts', text), { helpers: ['note'] })).toEqual([]);
  });

  it('check 6: a named entry point with its gate after its request', () => {
    const late = sourceOf(
      'src/fake/late.ts',
      "import { uploadsMayStart } from '@/store/ageStore';\nexport async function flush() {\n  await getSupabaseClient().from('t').insert([]);\n  return uploadsMayStart();\n}",
    );
    expect(entryPointOffenders('src/fake/late.ts', late, ['flush'])).toEqual(['src/fake/late.ts: flush sends before it checks the rule']);
  });

  it('check 7: the refusal must be the real opening, not text that mentions it', () => {
    const fixture = (body: string) => {
      const sf = sourceOf('src/fake/auth.ts', `export async function signInWithThing() {\n${body}\n  return go();\n}`);
      return signInOpeningOffenders(sf);
    };
    // The one accepted shape.
    expect(fixture('  const refused = await refuseWhenLocalOnly();\n  if (refused) return refused;')).toEqual([]);
    expect(fixture('  const refused = await refuseWhenLocalOnly();\n  if (refused) { return refused; }')).toEqual([]);
    // Each of these used to pass, or would.
    for (const body of [
      '  if (false) await refuseWhenLocalOnly();',
      '  const refused = await refuseWhenLocalOnly();',
      '  const refused = await refuseWhenLocalOnly();\n  if (!refused) return refused;',
      '  const refused = await refuseWhenLocalOnly();\n  if (refused) return null;',
      '  const refused = await refuseWhenLocalOnly();\n  if (refused) return refused;\n  else go();',
      '  let refused = await refuseWhenLocalOnly();\n  if (refused) return refused;',
      '  const refused = refuseWhenLocalOnly();\n  if (refused) return refused;',
      '  const refused = await refuseWhenLocalOnly(true);\n  if (refused) return refused;',
      '  const refused = (await refuseWhenLocalOnly()) ?? null;\n  if (refused) return refused;',
      '  // refuseWhenLocalOnly(\n  const x = 1;',
    ]) {
      expect({ body, offenders: fixture(body) }).toEqual({ body, offenders: ['signInWithThing'] });
    }
  });
});
