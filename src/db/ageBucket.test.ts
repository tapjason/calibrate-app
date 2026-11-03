import { getDb, setDbForTests } from './client';
import { clearAgeBucket, getAgeBucket, saveAgeBucket } from './ageBucket';
import { createTestDb } from './testing';

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('age bucket', () => {
  it('stores nothing until a band is saved, and only the two bounds', async () => {
    expect(await getAgeBucket()).toBeNull();

    const cols = (await getDb().all<{ name: string }>(`PRAGMA table_info(age_bucket)`)).map(
      (c) => c.name,
    );
    expect(cols).toEqual(['id', 'lower_bound', 'upper_bound']);

    await saveAgeBucket({ lowerBound: 18, upperBound: null });
    expect(await getAgeBucket()).toEqual({ lowerBound: 18, upperBound: null });
    expect(await getDb().get(`SELECT * FROM age_bucket`)).toEqual({
      id: 'me',
      lower_bound: 18,
      upper_bound: null,
    });
  });

  it('keeps a single row when the band is saved again', async () => {
    await saveAgeBucket({ lowerBound: null, upperBound: 13 });
    await saveAgeBucket({ lowerBound: 16, upperBound: 18 });

    expect(await getAgeBucket()).toEqual({ lowerBound: 16, upperBound: 18 });
    const count = await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM age_bucket`);
    expect(count?.n).toBe(1);
  });

  it('refuses an empty or reversed band', async () => {
    await expect(saveAgeBucket({ lowerBound: null, upperBound: null })).rejects.toThrow();
    await expect(saveAgeBucket({ lowerBound: 18, upperBound: 13 })).rejects.toThrow();
    expect(await getAgeBucket()).toBeNull();
  });

  it('clears the row', async () => {
    await saveAgeBucket({ lowerBound: 13, upperBound: 16 });
    await clearAgeBucket();
    expect(await getAgeBucket()).toBeNull();
  });
});
