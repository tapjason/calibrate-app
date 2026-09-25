export const APP_NAME = 'Calibrate';

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
 * Where `docs/PRIVACY_POLICY.md` is published. **Null until it is hosted** —
 * the paywall omits the link rather than shipping one that 404s. 3.1.2 needs
 * this set before submission; `docs/HUMAN_VERIFICATION.md` Batch E tracks it.
 */
export const PRIVACY_POLICY_URL: string | null = null;
