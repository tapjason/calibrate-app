import type { Prediction } from '@/types';

import { CSV_COLUMNS, csvFileName, predictionsToCsv } from './csv';

function p(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'p1',
    user_id: 'u1',
    title: 'Ship the release',
    category: 'work',
    confidence: 70,
    created_at: '2026-09-01T10:00:00.000Z',
    due_date: '2026-09-08T10:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2026-09-08T11:00:00.000Z',
    reflection: 'Went fine',
    integrity_bonus: false,
    ...overrides,
  };
}

const rows = (csv: string) => csv.split('\r\n');

describe('predictionsToCsv', () => {
  it('starts with the declared header row', () => {
    expect(rows(predictionsToCsv([]))[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('writes one row per prediction, newest first', () => {
    const csv = predictionsToCsv([
      p({ id: 'old', created_at: '2026-01-01T00:00:00.000Z' }),
      p({ id: 'new', created_at: '2026-09-01T00:00:00.000Z' }),
    ]);
    const [, first, second] = rows(csv);
    expect(first.startsWith('new,')).toBe(true);
    expect(second.startsWith('old,')).toBe(true);
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const csv = predictionsToCsv([
      p({ title: 'Ship, then rest', reflection: 'She said "no"' }),
    ]);
    expect(csv).toContain('"Ship, then rest"');
    expect(csv).toContain('"She said ""no"""');
  });

  it('writes an empty field for null, not the word null', () => {
    const csv = predictionsToCsv([p({ resolved_at: null, reflection: null })]);
    expect(csv).not.toContain('null');
    expect(rows(csv)[1].endsWith(',')).toBe(true);
  });

  // Roadmap D23: the dropped bonus isn't exported.
  it('has no integrity_bonus column', () => {
    expect(predictionsToCsv([p({ integrity_bonus: true })])).not.toMatch(/integrity|,true/);
  });

  // A title starting with = is executed as a formula by Excel and Sheets. The
  // export is the user's own text coming back at them through a program that
  // runs it — the one place a prediction title could do something.
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)'])(
    'neutralizes a formula-looking title (%s)',
    (title) => {
      const csv = predictionsToCsv([p({ title })]);
      expect(csv).toContain(`'${title}`);
    },
  );

  it('still quotes a formula-looking title that also has a comma', () => {
    const csv = predictionsToCsv([p({ title: '=A1,B2' })]);
    expect(csv).toContain(`"'=A1,B2"`);
  });

  it('uses CRLF line endings', () => {
    expect(predictionsToCsv([p()])).toContain('\r\n');
  });
});

describe('csvFileName', () => {
  it('is dated', () => {
    expect(csvFileName(new Date('2026-09-07T12:00:00.000Z'))).toBe(
      'calibrate-2026-09-07.csv',
    );
  });
});
