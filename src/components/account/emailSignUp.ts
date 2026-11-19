/**
 * Whether the sign-in screen offers Create account, a new account made with
 * an email and a password (SignInView).
 *
 * Off until a custom mail sender works in Supabase (owner decision
 * 2026-11-19, roadmap D69 (c)), so a new account's confirmation email can
 * reach its address. Off, the screen offers Sign in with Apple, Google and
 * email sign-in for an account that already exists, with one line pointing
 * someone new to Apple or Google.
 *
 * Turning it back on is this one line: the Sign in / Create account switch,
 * the sign-up path and step 190's password checklist are all kept in
 * SignInView for it. Its own module, so a test can state either value
 * (SignInView.test.tsx on, SignInView.signUpOff.test.tsx off).
 */
export const EMAIL_SIGN_UP_ENABLED = false;
