// US units beside the metric ones in the answer key (step 173, aggregate B2):
// metres and km² meant nothing to a US farmer (blind playtest round 13). The
// questions stay the same for everyone (D18); only the key's sentence gains
// feet, miles or square miles in brackets, for a phone set to a region that
// measures that way. Pure, so a test holds the arithmetic.

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Regions that measure in feet and miles. */
const US_UNIT_REGIONS = new Set(['US', 'LR', 'MM']);

/** What expo-localization says about the phone, as far as units go. */
export interface PhoneUnits {
  /** 'us', 'uk' or 'metric' from the phone's Region setting; null where unknown (web). */
  measurementSystem: string | null;
  /** The Region setting ("US"), not the language's region. */
  regionCode: string | null;
}

/**
 * The phone's Region setting (step 180). Until then the region came from the
 * language tag, so English (US) on a phone set to Germany read as feet and
 * miles. Null on a build without the module (the import itself throws there),
 * and the language tag is read instead.
 */
export function phoneUnits(): PhoneUnits | null {
  try {
    // On a phone, ask for the native module the way that answers null before
    // loading the package, which asks the way that throws: Metro reports that
    // throw as fatal when the `require` runs outside module load, before any
    // catch here sees it (code review of step 180). The web build has its own
    // entry and needs no native module.
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoLocalization')) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-localization') as {
      getLocales?: () => ReadonlyArray<Partial<PhoneUnits>> | undefined;
    };
    return unitsOf(mod.getLocales?.()?.[0]);
  } catch {
    return null;
  }
}

/** The two fields this file reads, from whatever the module handed back. */
export function unitsOf(first: unknown): PhoneUnits | null {
  if (typeof first !== 'object' || first === null) return null;
  const { measurementSystem, regionCode } = first as Record<string, unknown>;
  return {
    measurementSystem: typeof measurementSystem === 'string' ? measurementSystem : null,
    regionCode: typeof regionCode === 'string' ? regionCode : null,
  };
}

/**
 * Whether the phone measures in feet and miles: by its measurement system
 * where the phone says it, else by its Region setting, else (no module, or
 * neither known) by the region in its language tag, as before. 'uk' stays
 * metric here: the key gives heights and areas, which Britain reads in metres.
 */
export function prefersUsUnits(locale?: string, phone: PhoneUnits | null = phoneUnits()): boolean {
  if (locale === undefined && phone) {
    if (phone.measurementSystem) return phone.measurementSystem === 'us';
    if (phone.regionCode) return US_UNIT_REGIONS.has(phone.regionCode.toUpperCase());
  }
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
