// The guard for the under-13 rule (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md, "Every way data leaves the
// phone"). It reads the app's own source (every non-test .ts and .tsx under
// src/ and app/) with the TypeScript parser, so comments and strings don't
// count, and finds every place that can send something over the network. It
// checks:
//
//   1. The files that do equal NETWORK_FILES below, exactly. A new file that
//      sends anything fails here until it is gated and listed.
//   2. Each of them but the removal-only ones (account deletion) reads the
//      age store (`isLocalOnly`, `uploadsMayStart`, …).
//   3. In each, every exported function that can reach a request (itself, or
//      through a function of the same file) checks the rule first, directly or
//      through a function of the file that does, unless UNGATED_EXPORTS says
//      why not (sign-out and the refresh pause remove or stop, never send).
//   4. The entry points the design names check the rule in their own body
//      (GATED_ENTRY_POINTS), and so do the queue writer and billing's start.
//   5. Every exported `sign(In|Up)…` function in src/supabase/auth.ts starts
//      with `refuseWhenLocalOnly(`.
//
// What counts as a network call is in NETWORK_MARKERS' comments. It is a
// structural check: the behavioural tests (one per gated module, with a
// client whose every property access throws) show the gates hold.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';

const ROOT = join(__dirname, '..', '..');

/**
 * Every file that can send something over the network, and what it sends.
 * Pinned: a file that starts or stops making requests must change this list.
 */
const NETWORK_FILES: Readonly<Record<string, string>> = {
  'src/ai/coach.ts': 'the Coach request (session token, computed numbers): the empty result under the rule',
  'src/ai/refine.ts': 'Refine (dormant): null under the rule',
  'src/analytics/flush.ts': 'usage counts: nothing unless uploadsMayStart()',
  'src/billing/revenuecat.ts': 'RevenueCat: no API key under the rule, so never configured',
  'src/store/authStore.ts': 'the stored session at launch (getSession, onAuthStateChange); its syncs refused under the rule',
  'src/supabase/account.ts': 'account deletion: open under the rule, it removes data',
  'src/supabase/auth.ts': 'sign-in and sign-up (refused under the rule), sign-out (open), the session refresh',
  'src/supabase/client.ts': 'the Supabase client: made with the session refresh off under the rule',
  'src/supabase/sync.ts': 'predictions: nothing under the rule; a sweep under way stops',
};

/**
 * Files allowed to send without reading the age store, because they only
 * remove data (the main session's call 3). Nothing else belongs here.
 */
const REMOVAL_ONLY: ReadonlySet<string> = new Set(['src/supabase/account.ts']);

/** Exported functions that reach a request without checking the rule, and why. */
const UNGATED_EXPORTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'src/supabase/auth.ts': {
    signOut: 'ends the session, online or on this phone alone: removes data',
    signOutLocal: 'ends the session after account deletion: removes data',
    discardStoredSession: 'removes a stored session from this phone; sends nothing',
    pauseSessionRefresh: 'stops the session refresh; sends nothing',
  },
};

/** Entry points the design names, each checking the rule in its own body. */
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
  'src/analytics/flush.ts': ['flushEvents', 'run'],
  'src/analytics/track.ts': ['track'],
  'src/billing/revenuecat.ts': ['apiKeyForPlatform'],
  'src/billing/init.ts': ['startBilling', 'ensureBillingStarted', 'refreshBilling'],
  'src/supabase/auth.ts': ['refuseWhenLocalOnly', 'resumeSessionRefresh'],
  'src/supabase/client.ts': ['getSupabaseClient'],
  'src/store/authStore.ts': ['syncForUser'],
};

/** What checking the rule looks like in a function body. */
const GATE_CALLS: ReadonlySet<string> = new Set(['isLocalOnly', 'uploadsMayStart', 'refuseWhenLocalOnly']);

// ----------------------------------------------------------------------------
// What counts as a network call
// ----------------------------------------------------------------------------

/** Methods that send, or can send, wherever they are called. */
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
  // The system web sign-in sheet; push tokens (Expo's and Apple's servers).
  'openAuthSessionAsync',
  'getExpoPushTokenAsync',
  'getDevicePushTokenAsync',
  'sendBeacon',
]);

/** Methods that send when called on a Supabase auth client (`….auth.x(…)`). */
const AUTH_METHODS: ReadonlySet<string> = new Set(['signOut', 'getUser']);

/** Functions that send, or hand out the client that does, when called by name. */
const NETWORK_FUNCTIONS: ReadonlySet<string> = new Set(['fetch', 'getSupabaseClient', 'createClient']);

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

/** Receivers whose `.from('…')` is not a Supabase table. */
const NOT_A_TABLE: ReadonlySet<string> = new Set(['Array', 'Buffer', 'Object', 'Uint8Array', 'Set', 'Map', 'String']);

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

const parsed = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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

/** The network markers inside `root`, as short labels. Type positions are skipped. */
function markersIn(root: ts.Node): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImport(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (NETWORK_MODULES.some((re) => re.test(spec))) found.push(`import '${spec}'`);
      }
      return;
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      if (NETWORK_CONSTRUCTORS.has(node.expression.text)) found.push(`new ${node.expression.text}(`);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      if (callee.kind === ts.SyntaxKind.ImportKeyword && isStringArg(first)) {
        if (NETWORK_MODULES.some((re) => re.test(first.text))) found.push(`import('${first.text}')`);
      } else if (ts.isIdentifier(callee)) {
        if (callee.text === 'require' && isStringArg(first)) {
          if (NETWORK_MODULES.some((re) => re.test(first.text))) found.push(`require('${first.text}')`);
        } else if (NETWORK_FUNCTIONS.has(callee.text)) {
          found.push(`${callee.text}(`);
        }
      } else if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        const recv = callee.expression;
        if (NETWORK_METHODS.has(name)) found.push(`.${name}(`);
        else if (name === 'invoke' && ts.isPropertyAccessExpression(recv) && recv.name.text === 'functions') {
          found.push('functions.invoke(');
        } else if (
          AUTH_METHODS.has(name) &&
          ((ts.isPropertyAccessExpression(recv) && recv.name.text === 'auth') ||
            (ts.isIdentifier(recv) && /auth$/i.test(recv.text) && recv.text !== 'auth'))
        ) {
          found.push(`.auth.${name}(`);
        } else if (name === 'fetch' && ts.isIdentifier(recv) && ['globalThis', 'window', 'global', 'self'].includes(recv.text)) {
          found.push(`${recv.text}.fetch(`);
        } else if (name === 'from' && isStringArg(first) && !(ts.isIdentifier(recv) && NOT_A_TABLE.has(recv.text))) {
          found.push(`.from('${first.text}')`);
        }
      }
    }
    if (ts.isIdentifier(node) && NETWORK_IDENTIFIERS.has(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** A top-level function of a file: a declaration, or a const holding an arrow or function. */
interface TopFunction {
  name: string;
  node: ts.Node;
  exported: boolean;
  /** The body alone, for the first-statement check. */
  body: ts.ConciseBody | undefined;
}

function hasExport(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function topFunctions(sf: ts.SourceFile): TopFunction[] {
  const out: TopFunction[] = [];
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

/** Names called as plain functions inside `root`. */
function callsIn(root: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** Everything reachable from `start` through the file's own functions, `start` included. */
function reach(start: string, calls: ReadonlyMap<string, Set<string>>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const next = queue.pop() as string;
    for (const callee of calls.get(next) ?? []) {
      if (calls.has(callee) && !seen.has(callee)) {
        seen.add(callee);
        queue.push(callee);
      }
    }
  }
  return seen;
}

/** Whether a function's own node calls a gate, or a function of the file that calls one directly. */
function checksTheRule(fn: TopFunction, calls: ReadonlyMap<string, Set<string>>): boolean {
  const own = calls.get(fn.name) ?? new Set<string>();
  for (const name of own) {
    if (GATE_CALLS.has(name)) return true;
    const inner = calls.get(name);
    if (inner && [...inner].some((n) => GATE_CALLS.has(n))) return true;
  }
  return false;
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
  'file in NETWORK_FILES in src/age/egress.test.ts with what it sends, and add a behavioural test with ' +
  'a client whose every property access throws. Only a path that removes data (account deletion, ' +
  'sign-out) may skip the gate, and it goes in REMOVAL_ONLY or UNGATED_EXPORTS with the reason.';

// ----------------------------------------------------------------------------
// The checks
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
          'Take them off the list (and off REMOVAL_ONLY, UNGATED_EXPORTS and GATED_ENTRY_POINTS if there).',
      );
    }
    expect([...found.keys()].sort()).toEqual(listed);
  });

  it('scans enough of the app for the list to mean something', () => {
    expect(ALL_FILES.length).toBeGreaterThan(100);
    expect(ALL_FILES).toContain('app/_layout.tsx');
    // A marker in a comment or a string isn't a call.
    const sf = ts.createSourceFile(
      'probe.ts',
      "// fetch('x') and client.functions.invoke('y')\nconst s = \"getSupabaseClient()\";\nArray.from('ab');",
      ts.ScriptTarget.Latest,
      true,
    );
    expect(markersIn(sf)).toEqual([]);
    const live = ts.createSourceFile(
      'probe2.ts',
      "import type { SupabaseClient } from '@supabase/supabase-js';\nawait fetch(u);\nclient.from('predictions');\nsupabase.auth.signOut();\nnew WebSocket(u);",
      ts.ScriptTarget.Latest,
      true,
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

  it('every exported function that can reach a request checks the rule first', () => {
    const offenders: string[] = [];
    for (const file of Object.keys(NETWORK_FILES)) {
      if (REMOVAL_ONLY.has(file)) continue;
      const sf = parse(file);
      const fns = topFunctions(sf);
      const calls = new Map(fns.map((fn) => [fn.name, callsIn(fn.node)]));
      const sends = new Set(fns.filter((fn) => markersIn(fn.node).length > 0).map((fn) => fn.name));
      const allowed = UNGATED_EXPORTS[file] ?? {};
      for (const fn of fns) {
        if (!fn.exported || fn.name.startsWith('__') || fn.name in allowed) continue;
        const reaches = [...reach(fn.name, calls)].some((name) => sends.has(name));
        if (reaches && !checksTheRule(fn, calls)) offenders.push(`${file}: ${fn.name}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `These exported functions can send without checking the rule:\n  ${offenders.join('\n  ')}\n${HOW_TO_FIX}`,
      );
    }
    // The allowed ones are real, and still exported: a stale entry fails.
    for (const [file, names] of Object.entries(UNGATED_EXPORTS)) {
      const exported = topFunctions(parse(file))
        .filter((fn) => fn.exported)
        .map((fn) => fn.name);
      for (const name of Object.keys(names)) expect({ file, name, exported: exported.includes(name) }).toEqual({ file, name, exported: true });
    }
  });

  it('the entry points the design names check the rule in their own body', () => {
    const offenders: string[] = [];
    for (const [file, names] of Object.entries(GATED_ENTRY_POINTS)) {
      const fns = new Map(topFunctions(parse(file)).map((fn) => [fn.name, fn]));
      for (const name of names) {
        const fn = fns.get(name);
        if (!fn) {
          offenders.push(`${file}: ${name} (not found)`);
          continue;
        }
        if (![...callsIn(fn.node)].some((called) => GATE_CALLS.has(called))) offenders.push(`${file}: ${name}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(`These entry points don't check the rule in their own body:\n  ${offenders.join('\n  ')}\n${HOW_TO_FIX}`);
    }
  });

  it('every exported sign-in and sign-up function starts with refuseWhenLocalOnly()', () => {
    const fns = topFunctions(parse('src/supabase/auth.ts')).filter(
      (fn) => fn.exported && /^sign(In|Up)/.test(fn.name),
    );
    expect(fns.map((fn) => fn.name)).toEqual(
      expect.arrayContaining(['signInWithApple', 'signInWithGoogle', 'signInWithEmail', 'signUpWithEmail']),
    );
    const offenders = fns
      .filter((fn) => {
        const body = fn.body;
        if (!body || !ts.isBlock(body) || body.statements.length === 0) return true;
        return !/\brefuseWhenLocalOnly\(/.test(body.statements[0].getText());
      })
      .map((fn) => fn.name);
    if (offenders.length > 0) {
      throw new Error(
        `These sign-in functions don't start with refuseWhenLocalOnly(): ${offenders.join(', ')}. ` +
          'Make `const refused = await refuseWhenLocalOnly(); if (refused) return refused;` their first lines.',
      );
    }
  });
});
