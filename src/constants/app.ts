import Constants from 'expo-constants';

/**
 * The name people see (chosen for now 2026-11-03, `docs/APP_STORE_LISTING.md` §0).
 * Internal ids (the database, storage keys, notification ids, product ids,
 * the Expo slug) keep `calibrate`: renaming those loses data or unlinks the
 * EAS project. The bundle id (`app.fairlysure`) and the URL scheme
 * (`fairlysure`) changed before anything was registered with Apple.
 */
export const APP_NAME = 'Fairly Sure';
/** "Fairly Sure Plus": the paid tier's name. */
export const PLUS_NAME = `${APP_NAME} Plus`;

/**
 * The app's version ("1.0.0"), for the line under You's links: what a tester
 * quotes in a bug report. Null where the config isn't readable.
 */
export const APP_VERSION: string | null = Constants.expoConfig?.version ?? null;

/**
 * Whether the ✨ Refine button is part of the product.
 *
 * **Currently false — refine is cut from the first release.** The client
 * (`src/ai/refine.ts`), the Edge Function (`supabase/functions/refine/`) and
 * every test for both are kept intact and dormant, so bringing it back is
 * flipping this flag and deploying the function.
 *
 * Why it was cut (2026-09-24, first live run against a funded OpenAI account):
 * the prompt turns predictions into *questions* — "I'll finish the report"
 * came back as "Will I finish the report?" on four inputs out of four, which
 * is no more resolvable than what the user typed, and reads as a question in
 * a field that displays their prediction. Two rewrites showed the problem is
 * not the wording. Ask for specificity and the model invents the specifics
 * ("at least $100,000 in sales", a due date from 2023); forbid invention and
 * it hands back the input with the hedging stripped. A vague prediction
 * cannot be made checkable without information only the user has.
 *
 * That is a product question, not a prompt bug, and the feature is explicitly
 * optional — so it waits rather than shipping a button that makes predictions
 * worse. See `docs/HUMAN_VERIFICATION.md` and `CLAUDE.md` § AI Integration.
 */
export const REFINE_ENABLED = false;

/**
 * Terms of use for Plus: Apple's standard EULA, which is what applies unless
 * the app ships its own. App Review Guideline 3.1.2 requires a working link to
 * the terms of use *inside the app* for auto-renewing subscriptions, not only
 * in the store listing.
 */
export const TERMS_OF_USE_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/**
 * Public URL of `docs/PRIVACY_POLICY.md`.
 *
 * GitHub Pages project site for `tapjason/calibrate-app`, source folder
 * `/docs` on `master`. The file's permalink is `/privacy/`, so the page is
 * this URL once Pages is on. The paywall and Settings show the link. It 404s
 * until that switch is flipped (`docs/HUMAN_VERIFICATION.md`).
 */
export const PRIVACY_POLICY_URL = 'https://tapjason.github.io/calibrate-app/privacy/';

/**
 * Public URL of `docs/SUPPORT.md`, the App Store listing's Support URL, on
 * the same Pages site. You links to it (TestFlight prep, 2026-11-15): a way
 * to reach the developer from inside the app (guideline 1.5), and where a
 * tester's bug report goes when it isn't TestFlight's own feedback.
 */
export const SUPPORT_URL = 'https://tapjason.github.io/calibrate-app/support/';

/**
 * The app's numeric App Store id, from App Store Connect → App Information →
 * Apple ID (record created 2026-11-07). Text shares end on its product page.
 * The page is live only once the app is released, so until then a link from
 * a development or TestFlight build goes to a page that isn't there yet.
 * `GROWTH_AND_MONETIZATION.md` §0, step 1. Also `ascAppId` in `eas.json`.
 */
export const APP_STORE_ID: string | null = '6831917395';

/**
 * The provider token (`pt=`) App Store Connect issues with the first campaign
 * link (Analytics → Acquisition → Campaigns). It's the same for every
 * campaign. Null until then: shares link to the product page without a
 * campaign, so App Store Connect can't say which share brought an install.
 */
export const APP_STORE_PROVIDER_TOKEN: string | null = null;

/**
 * Whether predictions filed under a category the person added (roadmap D39)
 * go up to Supabase. It needs `supabase/migrations/006_custom_categories.sql`
 * on the live project (applied 2026-11-03): before it, the predictions table
 * accepted only the five built-ins, so pushing one failed on every sync. With
 * this off they stay on the phone, still dirty, and go up on the first sync
 * after it's on, and the Categories screen says so to a signed-in person.
 * Only the id syncs; the names stay on each phone.
 */
export const CUSTOM_CATEGORY_SYNC = true;

/**
 * Whether a guest's funnel events go up, with no id of any kind (roadmap D43,
 * decided 2026-11-03), so the funnel counts people who never sign in. It
 * needs `supabase/migrations/007_guest_analytics_events.sql` on the live
 * project: before it, every push would fail. With this off a guest's events
 * wait on the phone as before and go up with an account.
 */
export const GUEST_ANALYTICS = false;

/**
 * Whether the date a prediction was reworded goes up to Supabase (roadmap
 * D45, decided 2026-11-06). It needs `supabase/migrations/008_title_edited_at.sql`
 * on the live project: before it, an upsert naming the column fails on every
 * sync. With this off, the rest of the row syncs as before and the date
 * stays on the phone that made the edit, so another phone scores a
 * same-day answer to it as it did before D45.
 */
export const TITLE_EDIT_SYNC = false;

/**
 * Scored answers a confidence range needs before Log's track record shows it
 * with "Too few to read yet" (roadmap D57). From MIN_N_BAND (10) it reads
 * plainly. Stricter than Insights' counts (D53, from the first answer) because
 * Log is where a count can move the number being recorded: a perfectly
 * calibrated 70% caller sees a rate 20 or more points off a third of the time
 * at 5, and more than half the time at 3.
 */
export const TRACK_RECORD_MIN_N = 5;
