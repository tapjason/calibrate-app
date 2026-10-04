// Writes SQL that seeds the App Review demo account with the demo predictions
// (APP_STORE_LISTING.md §4). Run it, then paste the output into the Supabase
// SQL editor. It only touches that user's demo rows, so re-running it resets
// them.
//
//   node scripts/seed-demo-sql.mjs <demo-user-uuid> > demo-seed.sql
//
// The account itself (email, password) is created in the dashboard and its
// credentials go in App Store Connect, never in this repo. Dates are relative
// to when the script runs, so re-seed shortly before submitting for review.
//
// Needs Node 23.2+ for module.stripTypeScriptTypes: the generator is TypeScript
// with type-only imports, and the package is CommonJS, so it is stripped and
// loaded as an ES module here rather than imported directly.

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/db/demoData.ts', import.meta.url), 'utf8');
const { buildDemoPredictions } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`
);

const userId = process.argv[2];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!userId || !UUID.test(userId)) {
  console.error('usage: node scripts/seed-demo-sql.mjs <demo-user-uuid>');
  process.exit(1);
}

const quote = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const rows = buildDemoPredictions(userId, new Date());
const tag = rows[0].id.split('-').slice(0, 2).join('-');

const values = rows.map((p) =>
  [
    quote(p.id),
    quote(p.user_id),
    quote(p.title),
    quote(p.category),
    p.confidence,
    quote(p.created_at),
    quote(p.due_date),
    quote(p.status),
    quote(p.resolved_at),
    quote(p.reflection),
    p.integrity_bonus,
    'now()',
  ].join(', '),
);

process.stdout.write(
  [
    `-- Calibrate demo seed: ${rows.length} predictions for ${userId}`,
    'begin;',
    `delete from public.predictions where user_id = ${quote(userId)} and id like ${quote(`${tag}-%`)};`,
    'insert into public.predictions',
    '  (id, user_id, title, category, confidence, created_at, due_date,',
    '   status, resolved_at, reflection, integrity_bonus, updated_at)',
    'values',
    values.map((v) => `  (${v})`).join(',\n') + ';',
    'commit;',
    '',
  ].join('\n'),
);
