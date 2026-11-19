// What the screens say while the under-13 rule applies (roadmap D70,
// 2026-11-19; docs/design/research/under-13-2026-11.md, "The words"). Every
// string is the spec's, word for word. None says an age more precisely than
// "the age range" (localOnlyCopy.test.ts holds them to that): the app never
// tells anyone, or anyone looking over their shoulder, how old the phone says
// they are.

import { APP_NAME } from '@/constants/app';

/** A sign-in refused: the age store's words, so the store and the screens say the same. */
export { LOCAL_ONLY_SIGN_IN } from '@/store/ageStore';

/** You, the account group, a guest: the row in place of "Sign in". */
export const LOCAL_ONLY_GUEST_ROW = 'Kept on this phone';

/** You, the account group, a guest: the footer's first line. */
export const LOCAL_ONLY_GUEST_FOOTER = `Because of the age range this iPhone shares with ${APP_NAME}, everything you log stays on this phone. Accounts, backup, usage counts, Coach and Plus are off. Your predictions, score, badges and cards work as usual, and Export predictions keeps a copy.`;

/** You, the account group, a guest: the footer's second line, where the age range is seen. */
export const LOCAL_ONLY_GUEST_WHERE =
  "The age range comes from this iPhone's Apple Account. To see it: Settings → your name → Personal Information → Age Range for Apps.";

/** You, the account group, signed in: the footer of a frozen account (Sign out and Delete account stay). */
export const LOCAL_ONLY_FROZEN_FOOTER = `Backup is off on this phone because of the age range it shares with ${APP_NAME}, so new changes stay here. What was backed up before stays on our server until you delete the account. Signing out removes your predictions from this phone, so export them first if you want a copy.`;

/** Insights, the Coach panel, only where a Plus mirror is active. */
export const LOCAL_ONLY_COACH = `Coach is off on this phone because of the age range it shares with ${APP_NAME}.`;

/** The paywall route. */
export const LOCAL_ONLY_PAYWALL_TITLE = "Plus isn't offered on this phone";
export const LOCAL_ONLY_PAYWALL_BODY = `Because of the age range this iPhone shares with ${APP_NAME}, purchases are off here. Your score, chart, badges and cards are free.`;

/** The account route. */
export const LOCAL_ONLY_ACCOUNT_TITLE = 'No account on this phone';
export const LOCAL_ONLY_ACCOUNT_BODY = `Because of the age range this iPhone shares with ${APP_NAME}, your predictions stay on this phone. To keep a copy, use Export predictions in You.`;

/** The one button on either route's page. */
export const LOCAL_ONLY_CLOSE = 'Close';
