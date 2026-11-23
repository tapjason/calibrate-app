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
 * Whether "Continue with Google" is offered on the sign-in screen (step 192).
 *
 * **On since 2026-11-18**, once the owner had set up both halves
 * (`docs/HUMAN_VERIFICATION.md` A6): the Google Cloud OAuth client (a Web
 * client whose redirect URI is the Supabase project's `/auth/v1/callback`, the
 * consent screen published), and the Google provider enabled in Supabase with
 * `fairlysure://google-auth` (`GOOGLE_REDIRECT_URL` in `src/supabase/auth.ts`)
 * on its redirect allow-list, with Supabase migration 009's two triggers
 * enabled on the live project.
 *
 * It must not ship on without the Google provider enabled in Supabase: a tap
 * would open a sheet that can only fail. Turning it off hides the button and
 * makes Google unreachable: the button renders nothing, and nothing else calls
 * `signInWithGoogle`. Decided by the owner 2026-11-18: through the system
 * sign-in sheet, no Google SDK and no new package, the name and picture Google
 * sends discarded (Supabase migration 009), no Facebook
 * (`docs/design/research/sign-in-providers-2026-11.md`).
 */
export const GOOGLE_SIGN_IN_ENABLED = true;

/**
 * Whether the UTC offsets stored with each prediction (when it was logged and
 * when it was reworded: `created_utc_offset_min`,
 * `title_edited_utc_offset_min`; owner decision 2026-11-19) go up to Supabase
 * and come down from it. There is no answer offset (review round 6): the
 * same-day rule reads the answer's day in the logging's.
 *
 * **Off until the owner applies the Supabase migration that adds the two
 * columns to `public.predictions` (011).** Before it, an upsert naming an
 * unknown column fails the whole batch on every sync. With this off, no
 * pushed row names them (`listDirtyPredictions` leaves them out), and a
 * pulled row's are ignored: this phone keeps its own offset for a moment the
 * pulled row shares, and a moment that came from another phone has none, so
 * its days are read in this phone's zone, as every row was before. The same
 * pattern as `TITLE_EDIT_SYNC` before Supabase migration 008 (commits
 * e55eb11, 47a0ffb).
 *
 * Turned on, every pushed row carries both, null included, so no row in a
 * batch upsert writes NULL over another's (postgrest-js names the union of a
 * batch's keys). A pulled row that wins brings its own offset when it has
 * one; when it has none (an older build's row, or one pushed before the
 * flag), this phone keeps its own for the same moment, so a null from the
 * server never erases a known zone (`upsertPredictionFromRemote`, review
 * round 6). And once per account, the first sweeps with the flag on fill in
 * the offsets that rows pushed before it reached the server without
 * (`backfillOffsets`, src/supabase/sync.ts): only the offsets, each with the
 * moment it belongs to (`listOffsetBackfill`), as update-only requests that
 * never insert or re-push a row. The server fills an offset only while its
 * own is still null and only for the same instant it holds (`created_at` or
 * `title_edited_at`, compared as timestamptz), so a prediction deleted on
 * another phone stays deleted and a newer copy there isn't overwritten.
 * `updated_at` doesn't move, here or on the server. Once every row has gone
 * without a failure, `markOffsetBackfillDone` records it (SQLite migration
 * 020's `sync_markers`), and it never runs again for that account on this
 * phone.
 */
export const UTC_OFFSET_SYNC = false;

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
 * this URL; Pages is on, and `scripts/check.sh --release` checks that it
 * loads. The paywall and You show the link.
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
 * The provider token (`pt=`) App Store Connect issued with the first campaign
 * link (Analytics → Acquisition → Campaigns) on 2026-11-23. It's the same for
 * every campaign. Null would mean shares link to the product page without a
 * campaign, so App Store Connect couldn't say which share brought an install.
 */
export const APP_STORE_PROVIDER_TOKEN: string | null = '129758335';

/**
 * Scored answers a confidence range needs before Log's track record shows it
 * with "Too few to read yet" (roadmap D57). From MIN_N_BAND (10) it reads
 * plainly. Stricter than Insights' counts (D53, from the first answer) because
 * Log is where a count can move the number being recorded: a perfectly
 * calibrated 70% caller sees a rate 20 or more points off a third of the time
 * at 5, and more than half the time at 3.
 */
export const TRACK_RECORD_MIN_N = 5;
