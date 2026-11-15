import { dateLocale } from '@/constants/locale';

/**
 * A whole number grouped in the person's locale: "1,001-day streak", not
 * "1001-day streak" (playtest 2026-11-08b, finding 11). Below 1,000 it is
 * the plain digits.
 */
export function localCount(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  try {
    // English grouping on a phone in another language, as the dates are
    // (D63): "1.234 scored answers" sat in an English sentence.
    return new Intl.NumberFormat(dateLocale(), { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}
