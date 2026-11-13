// US units beside the metric ones in the answer key (step 173, aggregate B2):
// metres and km² meant nothing to a US farmer (blind playtest round 13). The
// questions stay the same for everyone (D18); only the key's sentence gains
// feet, miles or square miles in brackets, for a phone set to a region that
// measures that way. Pure, so a test holds the arithmetic.

/** Regions that measure in feet and miles. */
const US_UNIT_REGIONS = new Set(['US', 'LR', 'MM']);

/** Whether the phone's region measures in feet and miles. */
export function prefersUsUnits(locale?: string): boolean {
  try {
    const tag = locale ?? new Intl.NumberFormat().resolvedOptions().locale;
    const region = tag.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part));
    return region !== undefined && US_UNIT_REGIONS.has(region);
  } catch {
    return false;
  }
}

const number = (s: string) => Number(s.replace(/,/g, ''));
const whole = (n: number) => Math.round(n).toLocaleString('en-US');
const sig3 = (n: number) => {
  const digits = Math.floor(Math.log10(Math.abs(n))) + 1;
  const places = Math.max(0, 3 - digits);
  return places > 0 ? String(Number(n.toFixed(places))) : whole(Number(n.toPrecision(3)));
};

const FT_PER_M = 3.28084;
const MI_PER_KM = 0.621371;
const SQMI_PER_KM2 = 0.386102;

/**
 * "Everest is 8,849 m high, K2 8,611 m." → "Everest is 8,849 m (29,032 ft)
 * high, K2 8,611 m (28,251 ft)." Areas and diameters likewise.
 */
export function withUsUnits(fact: string): string {
  return fact
    .replace(/(\d[\d,]*(?:\.\d+)?) million km²/g, (_, n: string) =>
      `${n} million km² (${sig3(number(n) * SQMI_PER_KM2)} million sq mi)`,
    )
    .replace(/(\d[\d,]*(?:\.\d+)?) km²(?! \()/g, (_, n: string) =>
      `${n} km² (${sig3(number(n) * SQMI_PER_KM2)} sq mi)`,
    )
    .replace(/(\d[\d,]*(?:\.\d+)?) km(?![²\w])/g, (_, n: string) =>
      `${n} km (${whole(number(n) * MI_PER_KM)} miles)`,
    )
    .replace(/(\d[\d,]*(?:\.\d+)?) m(?![\w²])/g, (_, n: string) =>
      `${n} m (${whole(number(n) * FT_PER_M)} ft)`,
    );
}
