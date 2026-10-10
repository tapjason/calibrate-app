// CSV serialization (L3-ish: pure). Free since 2026-10-10 (roadmap D31): the
// data is the user's, so this produces the whole record, not a summary, and
// someone who exports can take their history somewhere else.
//
// Pure and dependency-free so it can be unit-tested without a filesystem; the
// writing and sharing live in src/export/file.ts.

import type { Prediction } from '@/types';

/** Column order. Stable — people build spreadsheets on top of this. */
export const CSV_COLUMNS = [
  'id',
  'title',
  'category',
  'confidence',
  'created_at',
  'due_date',
  'status',
  'resolved_at',
  'reflection',
  // No integrity_bonus: it was dropped as a reward (roadmap D23) and means
  // nothing to a reader.
] as const;

/**
 * Escape one field for RFC 4180.
 *
 * The leading-character guard is not decoration: a title beginning `=`, `+`,
 * `-` or `@` is executed as a formula when the file is opened in Excel or
 * Sheets, which turns "export your data" into a way for text the user typed
 * (or pasted) to run in their spreadsheet. Prefixing with an apostrophe keeps
 * it a string.
 */
function escapeField(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const text = risky ? `'${value}` : value;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return escapeField(value);
}

/**
 * Serialize predictions to CSV, newest first, with a header row.
 *
 * CRLF line endings, per RFC 4180 — it is what Excel expects and what every
 * other reader tolerates.
 */
export function predictionsToCsv(predictions: readonly Prediction[]): string {
  const rows = [...predictions].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  const lines = [CSV_COLUMNS.join(',')];
  for (const p of rows) {
    lines.push(
      [
        cell(p.id),
        cell(p.title),
        cell(p.category),
        cell(p.confidence),
        cell(p.created_at),
        cell(p.due_date),
        cell(p.status),
        cell(p.resolved_at),
        cell(p.reflection),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

/** File name for an export taken at `now`, e.g. `calibrate-2026-09-07.csv`. */
export function csvFileName(now: Date = new Date()): string {
  return `calibrate-${now.toISOString().slice(0, 10)}.csv`;
}
