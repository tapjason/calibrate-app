// The dependency arrow only points downward (BUILD_PLAN invariants): screens
// and components (L6) read the engine's numbers through the stores (L4) and
// never call the calibration engine (L3) or the SQLite client (L2) themselves.
// Type-only imports are fine: they are erased at build time.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Value imports (not `import type`) from a module prefix, across L6. */
function valueImportsFrom(prefix: string): string[] {
  const offenders: string[] = [];
  const files = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src', 'components'))];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const imports = text.match(/import\s+(?!type\b)[^;]*?from\s+'([^']+)'/g) ?? [];
    for (const statement of imports) {
      if (statement.includes(`'${prefix}`)) offenders.push(relative(ROOT, file));
    }
  }
  return offenders;
}

describe('layering (BUILD_PLAN invariants)', () => {
  it('keeps the calibration engine out of screens and components', () => {
    expect(valueImportsFrom('@/engine')).toEqual([]);
  });

  // One exception: the root layout is the composition root. It opens the
  // database (initDb) before any store can load from it.
  it('keeps the SQLite helpers out of screens and components', () => {
    const offenders = valueImportsFrom('@/db').filter(
      (file) => file.split(sep).join('/') !== 'app/_layout.tsx',
    );
    expect(offenders).toEqual([]);
  });
});
