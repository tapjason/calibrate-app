> **Research, 2026-11-18.** Asked by the owner on build 3: "Can you also add in login with
> google, and any other meta, relevant providers?" Two Opus checks (platform, policy), read
> and decided on by the main session. Nothing is built. The owner's answers are pending; the
> account rules that hold today are in [`../../ACCOUNT_SPEC.md`](../../ACCOUNT_SPEC.md).

# Sign-in providers: Google, Meta and the rest

## 1. Recommendation

1. **Google, through the system sign-in sheet, with no Google SDK.**
   `signInWithOAuth` with `skipBrowserRedirect`, `WebBrowser.openAuthSessionAsync` (iOS's
   ASWebAuthenticationSession), then `exchangeCodeForSession`. `expo-web-browser`, the
   `fairlysure` scheme and the PKCE client are already in the build, so it is JS only and
   can go in build 4. Behind a flag until the owner has set up Google Cloud and Supabase.
2. **No Facebook.** Section 4.
3. **Discard the name and picture Google sends** (section 3), so App Privacy stays at email.
4. **Keep email confirmation on** (section 5): with it off, adding Google would widen a
   takeover gap.

## 2. Google: the two ways

| | System sheet, no SDK (recommended) | Google's native SDK |
|---|---|---|
| Package | none new | `@react-native-google-signin/google-signin` 17.0.0 and its config plugin; a new development build |
| What the person sees | iOS asks to let the app use a website to sign in; Google's screen says "continue to `otopheizhjstoeyndcvc.supabase.co`" | a native Google sheet naming the app |
| Fixing the name shown | a Supabase custom domain: a paid plan plus $10 a month, then Google brand verification | not needed |
| Supabase's nonce check | stays on | the free package can't pass a nonce on iOS, so "Skip nonce check" must be turned on |
| Apple's listed SDKs | none | GoogleSignIn, AppAuth, GTMAppAuth, GTMSessionFetcher (privacy manifests); a possible Coarse Location row (the SDK reads the IP address for fraud prevention) |
| Revoking at deletion | re-authenticate, or point to Google's settings | `revokeAccess()` from the Keychain token |

Supabase's own pages disagree on which to use for Expo: the Google provider page shows the
native package with the nonce check skipped; the Expo social-auth quickstart says to use
`signInWithOAuth` on mobile because the free native package can't pass a nonce.

**Google Cloud (owner):** a project; the OAuth consent screen (app name, support email,
home page, the privacy policy URL, authorised domains), published to production (in
Testing only listed test users can sign in, so a reviewer couldn't); a Web client whose
redirect URI is `https://otopheizhjstoeyndcvc.supabase.co/auth/v1/callback`. No fee.
`openid`, `email` and `profile` need no security assessment. The app's name and logo show
on Google's screen only after brand verification, which needs a domain the owner controls.
**Supabase (owner):** enable Google with the client id and secret; add the redirect URL
(`fairlysure://…`, the exact path) to the allow-list.

**The button.** Google forbids a monochrome "G": it must be the standard four-colour mark.
Least colour: the Neutral or Light theme in light appearance, the Dark theme in dark;
"Continue with Google". Apple's button stays first and the same size. The G needs a line
in `DESIGN_SYSTEM.md` §2 as a third-party mark, like the Apple button.

## 3. What Google hands over

Supabase asks Google for `email` and `profile` and the app can't drop `profile`. From
Supabase Auth's source, the name (`name`, `full_name`) and picture URL (`picture`,
`avatar_url`) are written to `auth.users.raw_user_meta_data` and
`auth.identities.identity_data` on each sign-in. Nothing in the app uses either.

- **Discard them** with a database trigger that removes those keys as they arrive (written
  so a failure can never block a sign-in). Then App Privacy's Name row stays No. Whether a
  trigger on `auth.identities` is allowed on the hosted project isn't confirmed; it needs a
  test sign-in on the live project after the owner applies the migration.
- **Or keep them:** App Privacy gains Contact Info → Name (collected, linked, App
  Functionality), and the picture URL is a judgement call under Photos.

Either way: the Email row's evidence changes (it says no Google button ships), the User ID
row gains Google's account id, and the privacy policy needs a Google paragraph (§2.1), a
row in its processor table (§4) and a line on deletion (§7). Nothing is used for tracking;
no App Tracking Transparency prompt.

## 4. Meta (Facebook Login): not recommended

- **With the Facebook SDK: no.** Its App Events log installs, launches and purchases by
  default. Apple's own example of tracking is "a login SDK that repurposes the data it
  collects". It conflicts with `app-profile.md` §6 ("No ads, no tracking, no ATT prompt")
  and the privacy policy's "no advertising or third-party analytics SDK".
- **Through a web sheet, no SDK:** possible, at a price: a Meta app in Live mode with
  Advanced Access to `email` (Meta requires business verification for Advanced Access); a
  data-deletion instructions URL (Meta's Platform Terms); an annual Data Use Checkup;
  Apple's 5.1.1(v) clause on revoking social-network access names Facebook; accounts
  registered by phone return no email; and Meta has flagged browser-based Facebook login in
  native apps before (an Auth0 report, 2024-11).

Other providers Supabase supports (Microsoft, Discord, X and work or developer tools) add
the same duties each and nothing this audience asks for. Apple's Guideline 4.8 is already
met by Sign in with Apple and needs nothing more.

## 5. Found on the way: gaps that exist today

- **Pre-registration takeover, only if "Confirm email" is off.** With it off, an email
  sign-up counts as confirmed (read from Supabase Auth's source, `Mailer.Autoconfirm`; not
  confirmed on the hosted project). Anyone could then register someone else's address with
  a password, and when the real owner later signed in with Google, or with Apple sharing
  their real address, Supabase would link them into that account, where the first person
  could read what syncs. With it on, an unconfirmed sign-up is removed when the real owner
  arrives through a provider, so there is no takeover. **`ACCOUNT_SPEC.md` records it as
  on** (2026-10-01, for testing; a custom mail sender was chosen 2026-11-15 and isn't set
  up). The main session first told the owner it was off; that was a wrong premise, and the
  live setting is his to confirm in the dashboard. It must stay on once Google ships: never
  option A in `ACCOUNT_SPEC.md` (turning confirmation off for a beta).
- **Apple revocation for linked accounts (fixed, step 191).** Deletion read
  `app_metadata.provider`, which stays the first provider; a linked account's `providers`
  lists all. An email-first account later linked to Apple skipped Apple's token
  revocation. The app now asks `hasAppleIdentity`.
- **Under-13.** Supervised Google accounts for children can sign in to third-party apps
  with a parent's approval, so Google's own minimum age keeps nobody out. Decision 2 (the
  under-13 local-only rule) becomes more pressing, and whatever it says must hide every
  sign-in button.

## Not verified

- Nothing ran on a device: the sheet, the redirect back into the app, both buttons in dark.
- Google's page names SFSafariViewController as allowed and embedded webviews as forbidden;
  it doesn't name ASWebAuthenticationSession, though Supabase's and Expo's samples use it.
- Supabase publishes no Expo sample of the PKCE variant (its samples use the implicit flow
  and `setSession`); the linking and metadata behaviour is from the `master` source.
- Whether a trigger on `auth.identities` is permitted on the hosted project.
- Apple's Sign in with Apple HIG page (it didn't load); the placement rule is from secondary
  sources.

Sources: [Supabase Google auth](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Supabase deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking),
[custom domains](https://supabase.com/docs/guides/platform/custom-domains),
[Google native-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Google branding](https://developers.google.com/identity/branding-guidelines),
[Google User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
[Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Apple third-party SDK list](https://developer.apple.com/support/third-party-SDK-requirements/),
[App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[Meta Platform Terms](https://developers.facebook.com/terms/),
[Meta data deletion](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback),
[Meta access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels).
