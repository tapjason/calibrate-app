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
