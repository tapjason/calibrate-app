// Device-local age band. The service (src/age/ageRange.ts) decides whether
// a response is a band worth keeping; this file only reads and writes the
// two bounds. No other column exists.

import type { AgeBucket, ClearAgeBucket, GetAgeBucket, SaveAgeBucket } from '@/types';

import { getDb } from './client';

const ROW_ID = 'me';

interface AgeBucketRow {
  lower_bound: number | null;
  upper_bound: number | null;
}

export const getAgeBucket: GetAgeBucket = async () => {
  const row = await getDb().get<AgeBucketRow>(
    `SELECT lower_bound, upper_bound FROM age_bucket WHERE id = ?`,
    [ROW_ID],
  );
  if (!row) return null;
  return {
    lowerBound: row.lower_bound,
    upperBound: row.upper_bound,
  };
};

export const saveAgeBucket: SaveAgeBucket = async (bucket) => {
  await getDb().run(
    `INSERT INTO age_bucket (id, lower_bound, upper_bound)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       lower_bound = excluded.lower_bound,
       upper_bound = excluded.upper_bound`,
    [ROW_ID, bucket.lowerBound, bucket.upperBound],
  );
};

export const clearAgeBucket: ClearAgeBucket = async () => {
  await getDb().run(`DELETE FROM age_bucket`);
};
