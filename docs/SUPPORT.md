---
layout: default
title: Fairly Sure Support
permalink: /support/
---

<!--
Published at https://tapjason.github.io/calibrate-app/support/
The App Store's Support URL (docs/APP_STORE_LISTING.md §1). Keep the paths in
step with the app's screens.

HOLD (2026-11-19): this page publishes with the privacy policy (docs/PRIVACY_POLICY.md)
and carries the same "within 7 days" claim ("Delete my data"), and its sign-out and
sign-up entries describe the build that carries rounds 5 and 6 (the policy's header,
step 7). Push it only together with the policy, after
the owner steps in the policy's header comment are done.
-->

# Fairly Sure Support

Questions, bugs or ideas: email **tapjason-dev@gmail.com**. Include your iPhone
model and iOS version if something isn't working.

## Common questions

**My reminders don't arrive.** Check iOS Settings → Notifications → Fairly Sure,
then the switches under You → Notifications in the app.

**Why can't I see my score yet?** It appears after 20 scored answers.
Before that, a few answers can't say much, so the app shows how many are left.

**An answer says "not scored".** Answers given the same day you logged the
prediction, and "Can't tell" answers, stay in History but don't count toward
your score. This keeps the score from being padded with sure things.

**I answered the wrong way.** For 24 hours after answering, tap the prediction in
History to switch the answer, move it to another category, or delete it.

**Forgot your password?** There's no password reset in the app yet. Email
**tapjason-dev@gmail.com** from the address you signed up with, and we'll reply.
Your predictions aren't lost: what reached our server stays backed up there, and
a phone that's still signed in keeps its copy.

**Signed up by email and got no confirmation?** Confirmation emails aren't being
sent yet, so the app doesn't offer Create account for now. Use Sign in with
Apple or Continue with Google. An email account you could already sign in to
still signs in with its password. If you'd like an unconfirmed sign-up deleted,
email us from that address.

<!-- Both entries are true until the custom mail sender exists (docs/SHIP_READINESS.md
decisions 6 and 12; docs/ACCOUNT_SPEC.md §1: Supabase's built-in sender reaches only
members of the Supabase organization). Create account is hidden by
EMAIL_SIGN_UP_ENABLED = false (src/components/account/emailSignUp.ts; roadmap D69 (c)).
Remove or rewrite them when it returns. -->

**Signing out.** You → Sign out first tries to back up anything not yet on our
server (if something can't be sent, or you have categories that live only on
this phone, the app asks before going on), then removes your account's
predictions from this phone. Signing back in brings back what was
backed up. Names, icons and hiding you set for categories are kept only on the
phone, so set them again after signing back in.

**Restore a purchase.** You → Fairly Sure Plus → Restore purchases.

**Cancel a subscription.** Subscriptions are managed by Apple: iOS Settings →
your name → Subscriptions → Fairly Sure. Cancel at least 24 hours before the
period or trial ends.

**Keep a copy of my predictions.** You → Export predictions (CSV).

**The lock won't open.** The lock (You → Lock with Face ID, named for how your
iPhone unlocks) uses your iPhone's own
Face ID, Touch ID and passcode. Fairly Sure has no code of its own and can't open
or reset it for you. If Face ID doesn't recognise you, tap Unlock and use your
iPhone passcode when iOS offers it. If it still won't open, restart the iPhone and
try again, then email us. If you never signed in, don't delete the app: your
predictions are only on this phone.

**What the lock doesn't cover.** Reminders, which sit on the lock screen. While the
lock is on they can't record an answer, and they show your prediction's words only
if You → Notifications → Show the words in reminders is on.

**Delete my data.** Signed in: You → Delete account removes it from our servers
and your phone (our hosting provider's short-lived logs and backups expire on
their own within 7 days; the privacy policy has the details). Not signed in:
You → Erase your data on this phone. Deleting an account doesn't cancel a
subscription; cancel it first.

[Privacy policy](../privacy/)
