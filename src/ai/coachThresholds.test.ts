import { readFileSync } from 'fs';
import { join } from 'path';

import { MIN_N_CATEGORY, MIN_N_OVERALL } from '@/types';

// The Coach's Edge Function (Deno) keeps its own copies of the minimum-N
// gates; the phone re-checks with these. Copied by hand, so a change to one
// (roadmap D46 moved the category gate to 20) must reach the other.
describe('the Coach function gates on the same counts as the app', () => {
  const source = readFileSync(join(__dirname, '../../supabase/functions/coach/index.ts'), 'utf8');
  const constant = (name: string) => {
    const m = source.match(new RegExp(`const ${name} = (\\d+);`));
    return m ? Number(m[1]) : null;
  };

  it('uses the app’s MIN_N_CATEGORY and MIN_N_OVERALL', () => {
    expect(constant('MIN_N_CATEGORY')).toBe(MIN_N_CATEGORY);
    expect(constant('MIN_N_OVERALL')).toBe(MIN_N_OVERALL);
  });
});
