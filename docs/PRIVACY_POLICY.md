---
layout: default
title: Fairly Sure Privacy Policy
permalink: /privacy/
---

<!--
Published at https://tapjason.github.io/calibrate-app/privacy/
If the app's name changes, update it here. Not legal advice.
What each claim rests on, and what would change the text next: PRIVACY_POLICY.notes.md
(not published). This comment is in the published page's source, so keep it short.
-->

# Fairly Sure Privacy Policy

**Effective:** November 20, 2026 · **Contact:** tapjason-dev@gmail.com

Fairly Sure ("the app") is made by Jason Zou. This policy says what
the app collects, why, who else handles it, and how to delete it. It's written
to be read, not skimmed past.

## 1. The short version

- **Without an account, your predictions stay on your phone.** We never receive
  them. You can log, resolve, score, and share predictions entirely offline. A
  few usage counts are sent, with no account, device or install identifier, once
  the warm-up has told you so; you can turn them off there or in You (§2). On an
  iPhone whose Region is set to Canada, or whose language is a Canadian one such
  as English (Canada), they start off, and none are sent unless you turn them
  on. None are sent if Apple says this iPhone's age range is under 13 (§9).
- **With an account, your predictions are backed up to our server** so they
  survive a new phone. That includes their text. Signing out removes them from
  the phone; signing back in brings back what was backed up (§7).
- **We don't sell your data, show ads, or track you across other apps or
  websites.** The app contains no advertising or third-party analytics SDK.
- **The AI Coach sees numbers, never your words.** It receives calibration
  statistics only. It is technically unable to send the text of a prediction or
  reflection, because the data it's built from has no field for text.
- **You can delete your account and its data from inside the app.** Our hosting
  provider's short-lived logs and backups expire on their own (§6, §7).

## 2. What we collect

### If you don't sign in
Your predictions, results, and settings stay in a database on your device.
(Your iPhone's own backup to iCloud or a computer, if you use one, includes
them, as it does any app's data.)

Usage events (§2.3) are recorded on the device. A few of them, those that
count how many people start and finish the warm-up, log, answer, share and
practise, are sent to us, but only after the warm-up's first screen has shown
you a line saying so and what they're for (to see how the app is used), with a
switch to turn them off (the same switch as You → Usage stats). Until then they
wait on the phone. On an iPhone whose Region is set to Canada, or whose language
is a Canadian one such as English (Canada), that switch starts off: no usage
events are kept for sending and none are sent until you turn it on, there, in
You or on the sign-in screen, and the warm-up's line says so. On an iPhone
running iOS 26 or later, on a launch where the app doesn't yet hold an age range
of 13 or over from Apple (below), they also wait for Apple's answer, and if the
range is under 13 none are kept for sending and none are sent (§9). They carry
the event's details (§2.3) and no account, device or install identifier. Our
server replaces each event's own id with a one-way scrambled version of it and keeps only the day the
event happened, not the time. Like any request over the internet, they reach our
hosting provider with your IP address, which its logs may keep for up to 7 days
(§6); the counts themselves don't store it. Because they carry no account,
device or install identifier, we have no way to find yours, so we can't delete
them on request. The other events, and any of the few still waiting on the
phone, are sent only if you later sign in or create an account, with it (§2.3).
You can turn usage stats off at any time, on that warm-up screen or in You →
Usage stats: that deletes the ones still on the device and stops all of them.

To know whether you have Fairly Sure Plus, the app asks RevenueCat, the
service that manages subscriptions, each time it starts. On an iPhone running iOS 26
or later, on a launch where it
doesn't yet hold an age range of 13 or over from Apple (below), it waits for
Apple's answer first, however long that takes: if you open the Plus screen
sooner, the plans don't load until the answer is in. If that answer is under
13, RevenueCat isn't started, on that launch or any later one while the range
stays under 13 (§9). On an iPhone that had already shared a range of 13 or
over, the app starts RevenueCat at launch as usual; if Apple's answer then
turns out to be under 13, the app asks RevenueCat for nothing more (a request
already on its way completes), but RevenueCat's code stays running until the
app is next closed, and can refresh its purchase information on its own
meanwhile; it isn't started again from the next launch. If you signed out
while RevenueCat wasn't running, the app signs that account out of RevenueCat
the next time it starts RevenueCat, before reading whether you have Plus, so
an earlier account's Plus can't show for someone who isn't signed in. Without an account
that request carries a random identifier RevenueCat makes for this install,
not your name, email or anything you typed, along with the technical details
any app request carries (such as your IP address, the app version and
language). None of your predictions are sent.

On an iPhone running iOS 26 or later, the app asks Apple for an age range
once its first screen is up, at each launch, and, while it holds a range or
the under-13 rule applies (§9), again when you come back to the app a day or
more after it last asked. Apple, not the app, decides whether you see its
question again or it answers from what you chose before. The app asks each
time because the range it stores belongs to this copy of the app, not to an
Apple Account: an iPhone handed to someone else, or set up from a backup,
would otherwise keep the earlier range. If you share one, only the age band — a
lower and an upper bound, not your birthday — is stored on the device. It is
not sent to us. A band that includes ages under 13 turns off signing in,
backup, usage counts, the Coach and Fairly Sure Plus (§9) as soon as it
arrives, stopping a backup or a send of usage counts that is under way before
its next request; any other band, or none, changes nothing. If you decline, or
Apple can't answer, a band you shared before stays. If the stored band can't
be read, the app treats the iPhone as under 13 until Apple answers with a band
of 13 or over. While the app is waiting for Apple's answer and doesn't yet
hold a band of 13 or over, signing in waits up to 5 seconds and is then
refused for the moment ("Sign-in isn't ready yet. Try again in a moment."),
and the Coach sends nothing until the answer is in.
Erase and account deletion remove the band with the rest of the on-device
data. For the rest of that session the app stores no band, even if Apple
answers a question that was already under way (an under-13 answer still
turns everything off for that session), and it asks again at the next launch.

### If you create an account

**2.1 Account information.** Your email address, or, if you use Sign in with
Apple, the address Apple gives us, which may be a private relay address, and an
identifier for your Apple ID. If your account signs in with an email address
and password, also your password, which our sign-in service stores only as a
one-way hash. If you use Continue with Google, Google gives us your email
address and an identifier for your Google account. Google also sends your name
and profile picture. We don't use them, and our database removes them as they
arrive; your name can still appear in our hosting provider's sign-in logs until
those are deleted (§6). The sign-in service also records when your account was
created and when you last signed in, and, for each device you're signed in on,
the IP address and a short technical description of the app and system (its
"user agent") from the last time that device renewed its sign-in. We use
account information only to sign you in and keep your account working.

**2.2 Your predictions.** The text of each prediction, its category (a built-in
one such as "finance", or for a category you added, a random id, never the
name you gave it), the confidence you gave it, its due date, how it resolved,
any reflection you wrote, and when it was made, answered and last changed. We
store these so you can restore them on another device. We don't read, analyze,
or share them. On your phone, the app also keeps with each prediction how far
your phone's time zone was from UTC (in minutes) when you made it and when you
last reworded it. An answer given on the day you made the prediction doesn't
count toward your score, and that day is judged where you made it, so moving to
another time zone doesn't change which answers count. If your version of the
app backs these offsets up, they're stored with the prediction on our server
too. Your warm-up and daily practice answers are not predictions:
the answers themselves stay on your device, signed in or not. What is sent is a
tally: when you finish the warm-up, its 0–100 score and how many questions it
had; when you finish a day's practice, how many you got right out of how many
(§2.3).

**2.3 Usage events.** A small, fixed list of in-app events, such as "warmup
started", "prediction logged", "share completed" and "paywall viewed". Each
carries only numbers, yes/no values and fixed labels from the app: for
example, the confidence you chose and whether the prediction came true, not
what you predicted; or which screen opened the paywall and which kind of card
was shared. They tell us whether the app works for people. The full list:

`warmup_started`, `warmup_completed`, `share_opened`, `share_completed`,
`prediction_logged`, `prediction_resolved`, `paywall_viewed`,
`purchase_completed`, `purchase_abandoned`, `coverage_nudge_shown`,
`coverage_nudge_accepted`, `practice_started`, `practice_completed`,
`practice_reminder_set` (sent only by versions before 1.1.0), `coach_requested`, `data_exported`.

These are linked to your account. The sign-in screen says so before you sign
in, including that events recorded before you signed in and still on the phone
go with your account, and it has a switch to turn them off (the same switch as
You → Usage stats); while they're off, it says none are sent. On an iPhone
whose Region is set to Canada, or whose language is a Canadian one such as
English (Canada), the switch starts off, so none are sent, before or after you
sign in, until you turn it on. **You can turn them off** there or in You →
Usage stats. (The few sent before you sign in
carry no account, device or install identifier, as described above, so they
can't be found or deleted as yours.)

**2.4 Purchase status.** Whether you have Fairly Sure Plus, which plan, and when it
renews or ends. We receive this from our subscription provider (§4). We never
see your payment details.

**2.5 Coach usage count.** If you use the Coach, a daily count of requests, to
enforce usage limits.

### What we never collect
Precise location, contacts, health or fitness data, financial accounts, photos, or your
device's advertising identifier. The app never asks for your location, and we
don't work out where you are from your IP address; our hosting provider's
request logs can record the country a request came from (§6). If your version
of the app backs up the time-zone offsets in §2.2, our server stores them with
your predictions. An offset from UTC says roughly where in the world your
phone's clock was set, and some, such as Nepal's, are used by only one
country. We use them only to tell which day a prediction was made on, for the
app's scoring rules, and nothing works out a place from them. The app has no
crash reporter of its own. Apple may share a report with us when the app
crashes: for TestFlight testers, and otherwise only if you've chosen in your
iPhone's settings to share analytics with app developers. A picture you pick as
a category icon is shrunk and kept on your phone; it is never uploaded. The
names you give categories stay on your phone too. "Health" and "finance" in
Fairly Sure are labels you choose for your own predictions. The app doesn't
connect to any health or financial service.

## 3. The AI Coach (Fairly Sure Plus, off by default)

The Coach is optional and is turned off until you switch it on. When you tap
**Get feedback**, the app sends our server a summary of your statistics: your
overall calibration score and how many scored answers you have; for each
built-in category you've answered in, the number of scored answers, the
category's score, the average confidence, the share that came true, and whether
it leans overconfident, underconfident or neither; and a few patterns computed
from those numbers (such as which weekday you're least accurate on, and how a
category's score has moved), each with how many answers it rests on. A category
you added isn't named or listed in the summary, but its answers count in the
overall figures (your overall score, your number of scored answers and the
weekday pattern). **No prediction text, no reflections, no names you typed, no
email address.**

Our server checks that the request comes from a signed-in account with Plus,
then forwards the summary, without your account id or email, to OpenAI to
generate the feedback. OpenAI's published API data controls (read
November 20, 2026) say that data sent to its API isn't used to train its models
unless the customer opts in, and that OpenAI keeps abuse-monitoring logs of API
use for up to 30 days, unless longer retention is required by law, or is
reasonably necessary to protect its services or any third party from harm.

## 4. Who else handles your data

| Service | What it receives | Why |
|---|---|---|
| **Supabase** (database, sign-in and our server functions; servers in the United States) | Everything in §2.1–2.5, the guest usage counts in §2, and the IP address each request arrives with | Stores your account and backed-up predictions, and runs our server |
| **OpenAI** | The statistics summary in §3, only when you request Coach feedback, without your account id or email | Generates Coach feedback |
| **RevenueCat** | An account identifier (a random one for this install if you haven't signed in), your App Store purchase records, and the technical details of each request (such as IP address, app version and language) | Manages subscriptions |
| **Apple** | Payments, and sign-in if you use Sign in with Apple. When you delete an account that uses Sign in with Apple, our server asks Apple to revoke the app's access | App Store billing and authentication |
| **Google** | Nothing from the app. If you use Continue with Google, Google knows you signed in to Fairly Sure | Authentication |

We share data with these providers only to run the app. We don't sell or rent
personal data, and we don't share it for advertising.

Supabase and RevenueCat handle data on our behalf. Under their data processing
terms, they may process it only on our instructions to provide their service,
must protect it with technical and organizational security measures, and must
hold any company they rely on to terms no less protective. OpenAI handles the
Coach summary under its API terms, as described in §3. Apple and Google handle
payments and sign-in as independent companies, under their own privacy
policies.

## 5. Notifications

Reminders are scheduled **on your device**. We don't collect a push token and
we don't send notifications from a server. From version 1.1.0, a due-day reminder shows only
the day you made the prediction and the confidence you gave it, never its words.
The weekly digest shows only how many predictions are open.

## 6. How long we keep it

- **Your account, backed-up predictions, purchase status and Coach usage
  count:** as long as your account exists. Deleting your account deletes them
  (§7).
- **Usage events sent with your account (§2.3):** 13 months from when our
  server receives them; a daily job then deletes them. Deleting your account
  deletes them sooner (§7).
- **Sign-in sessions** (with the IP address and user agent in §2.1): until you
  sign out with a connection, which ends every session of your account, or
  delete your account.
- **Usage counts sent without an account (§2):** 13 months from when our server
  receives them; the same daily job then deletes them. They carry no account,
  device or install identifier.
- **Our hosting provider's logs:** Supabase keeps logs of requests to our
  server and of sign-ins, which can include your email address, your IP address,
  the country a request came from and the time (and, for a Google sign-in, your
  name), for security and to keep the service running. They're deleted
  automatically within 7 days.
- **Backups:** if our hosting provider keeps backups of our database, they're
  deleted automatically within 7 days, so data you delete can remain in one
  for up to that long.
- **OpenAI:** the abuse-monitoring logs described in §3, up to 30 days.
- **RevenueCat:** its record of your account identifier and its purchases,
  until account deletion asks RevenueCat to delete it (§7). A record made
  without an account, under a random install identifier, stays at RevenueCat.
  Neither holds your email or anything you wrote.
- **On your phone:** until you delete it (§7), sign out of the account it
  belongs to (§7; the counts that only this phone keeps stay until you delete
  your account on this phone, use Erase on it after signing out, or delete the
  app), or delete the app. If you
  delete the app while signed in, iOS may keep your sign-in session in the
  Keychain (§10); if you install the app again, it doesn't use that session and
  deletes it.

## 7. Deleting your account, and signing out

In the app: **You → Delete account** (at the bottom). This permanently deletes, at once:

- your account, email address and sign-in sessions,
- all backed-up predictions and reflections,
- your usage events, purchase status and Coach usage count on our server,
- and this phone's copy of your data: predictions, categories and their icons,
  the counts of deleted, late-changed and moved predictions, warm-up and
  practice answers, the age band, a prediction you were still typing, and the
  exported files, card images and pictures the app left in the phone's cache. Your settings (switches and reminder times), which hold
  nothing you wrote, stay (unless they can't be read at that moment; then they
  are replaced, as described under Erase below).

We also ask RevenueCat to delete its record for your account. That step is
best effort: if RevenueCat can't be reached, your account is still deleted.
RevenueCat's record holds no email and nothing you wrote; if you want to be
sure it's gone, email us.

A few copies outlast the deletion for a short time. Our hosting provider's logs
(including a record of the deletion with your email address) and any backups
are deleted automatically within 7 days (§6). If you used the Coach, OpenAI may
keep its copies of your statistics summaries, which carry no account id, for up
to 30 days (§3). Usage counts sent before you signed in stay until they're 13
months old (§6), since they carry no account, device or install identifier to
find them by. Apple keeps its own records of your App Store purchases. If your
account is also signed in on another phone, or its session there ended without
signing out there (see "Signing out", below), that phone keeps its copy until
you use Erase there or delete the app there. A phone you signed out on keeps the account's counts
of deleted, late-changed and moved predictions (see "Signing out"), which hold
no words, until you use Erase there or delete the app there.

If your account uses Sign in with Apple, you're asked to confirm with Apple,
and our server then revokes Fairly Sure's access to that Apple ID. If you
cancel that step, or confirm with a different Apple ID, your account is still
deleted but that access isn't revoked: remove it in your iPhone's Settings, by
tapping your name and looking for Sign in with Apple.
If you signed in with Google, deleting your account removes what Google shared
with us; to disconnect Fairly Sure on Google's side as well, remove it in your
Google Account's security settings, under third-party connections.

**Deleting your account doesn't cancel an App Store subscription.** Apple bills
it, so cancel it first in Settings → [your name] → Subscriptions, or the app
will point you there.

**Signing out** (You → Sign out) first tries to send our server any changes
this phone hasn't backed up yet (except on an iPhone whose age range is under
13, where no changes are sent, §9). If some can't be sent, for example without a
connection, or if you have categories that are kept only on this phone (ones
you added, renamed, gave an icon or hid), the app says how many and asks before
going on. If you go on, those categories are removed, and those changes don't
reach our server: a prediction, answer, edit or note that wasn't sent is lost, and a
deletion that wasn't sent waits on this phone until you sign in to the account
here again. If anything more of that kind appears before your data is removed,
the app stops and asks again.

Then your account's data is removed from this phone: its predictions and
reflections, the categories you added and any names, icons or hiding you set
for categories, and usage events not yet sent, along with the exported files, card
images and pictures the app left in the phone's cache. If that can't
finish at once, the app tries again the next time it opens. The counts of
deleted, late-changed and moved predictions that only this phone keeps (they
hold no words) stay on the phone, so signing out and back in doesn't clear them.

It then ends your session on this phone. With a connection, it also ends your
sessions on every other device. Without one, our server isn't told, but this
phone no longer holds anything that could use the session; it ends the next
time you sign out with a connection, or when you delete your account. If even
this phone can't end the session, you stay signed in, and the app says so. If
your data had already been removed from the phone, what was backed up comes
back from our server; what you agreed to lose, above, doesn't. (On an iPhone
whose age range is under 13, what was backed up stays on our server and
doesn't come back to the phone while that lasts, and the app says so, §9.)

Signing back in brings back your predictions and reflections from our server.
Category names, icons and hiding are kept only on the phone, so they don't come
back, and neither do the time-zone offsets in §2.2 unless your version of the
app backs them up. Your warm-up, daily practice and age band belong to the
phone rather than the account, and stay, as do your settings (unless they
can't be read when you sign out; then they are replaced, as described under
Erase below). Reminders for the
account's predictions stop, and any on the lock screen showing a prediction's
words are cleared.

When a phone's session ends some other way, for example because you signed
out on a different phone, that phone keeps its copy of your data, out of view,
until you sign in and out again there, use Erase there, or delete the app there.

Without an account, **You → Erase your data on this phone** removes everything
Fairly Sure keeps on the phone, whoever's account it was under, except four
things that hold nothing you wrote: your settings (switches and reminder times),
whether this phone has Fairly Sure Plus, what RevenueCat's code keeps on the
phone (§2: its identifier for this install, or for an account that signed out
while RevenueCat wasn't running, until RevenueCat next starts, and the purchase
status it last read), and the ids of accounts that signed
out here, which stop an old sign-in from coming back. (If the saved settings
can't be read when you erase, they are replaced with the ones the app is using
then, with each privacy choice on its more private setting.) Before it starts,
the app counts any changes that accounts signed in here before never sent to
our server, and says how many would be lost, or, if it can't count them, that
there may be some. If any part of the erase doesn't complete, the app says it
couldn't finish, and you can run it again. So it removes predictions and
reflections, categories and their icons, warm-up and practice answers, the age
band, a prediction you were still typing, usage events not yet sent, the counts of
deleted, late-changed and
moved predictions that signing out leaves, and anything else an account signed
in here before left behind, along with the exported files, card images and
pictures the app left in the phone's cache. What an account backed up stays on
our server until that account is deleted.

You can also email tapjason-dev@gmail.com to request deletion or a copy of your data.

## 8. Your rights

Depending on where you live, you may have the right to see the personal data
we hold about you, to have it corrected, to get a copy of it and to have it
deleted. Examples are the CCPA in California, PIPEDA in Canada, and the
Privacy Acts of Australia and New Zealand. You can export your predictions
yourself as CSV (You → Export predictions), delete your account in the app
(§7), or ask us for any of these at tapjason-dev@gmail.com. We'll respond
within 20 working days. We don't sell personal information as the CCPA
defines it.

Your data is stored in the United States (§4), which may be outside the
country you live in.

If you have a complaint about how we handle your data, please write to us
first, at the same address. If you aren't satisfied with our answer, you can
complain to the Office of the Privacy Commissioner of Canada, the Office of
the Australian Information Commissioner, or New Zealand's Office of the
Privacy Commissioner.

## 9. Children

Fairly Sure is not directed to children under 13, and we don't knowingly collect
their personal information.

If the age range an iPhone shares with Fairly Sure (§2) includes ages under 13
(this policy calls that "under 13"), the app keeps what you log on the phone.
There is no signing in, no backup, no usage counts and no Coach, and Fairly Sure
Plus isn't offered, so RevenueCat isn't started (§2 says what happens if it was
already running when the range arrived). It doesn't ask for an App Store rating
either. Everything else works as usual, and You → Export predictions keeps a
copy. The app explains this in You without saying an age. If the range shared
later is 13 or over, the app goes back to working as the rest of this policy
describes.

"Includes ages under 13" is read widely, so that the rule errs on the side of
sending nothing. Apple's ranges can differ by region. Where they have no
boundary at 13, a range such as "15 or under" or "17 or under" counts as under
13 too, so in those regions people aged 13 to 15, or to 17, get the same
on-phone-only app.

The app checks the range before a sign-in starts and again when Apple's or
Google's sign-in sheet closes, before anything is sent to our server. Two gaps
remain, both only when an under-13 range arrives during a sign-in on an iPhone
that had shared a range of 13 or over before: a sign-in with an email address
and password that was already sent goes through, and with Google, our sign-in
service has already created or found the account by the time Google's sheet
closes, so the account exists on our server even though the app refuses to use
it.

If an account was already signed in on that iPhone, it stays signed in but is
frozen: nothing new is backed up, nothing is deleted from our server, and its
predictions stay on the phone. What was backed up before stays on our server
until the account is deleted, and Sign out and Delete account still work; since
nothing can be backed up, signing out says how many changes haven't reached our
server and asks before removing them (§7). Apart from those two, one thing
still reaches our server: each time the app starts and that account's sign-in
has expired or is about to, the app renews it. That sends the sign-in's refresh token and,
like any request, the phone's IP address (which our sign-in service records,
as in §2.1), and none of your predictions. The same renewal can happen for any
signed-in account at a launch where the app is still waiting for Apple's
answer. On such a launch, if Apple hasn't answered within a minute, a signed-in
account's backup goes ahead as usual, and signing out sends unsent changes
after waiting up to 5 seconds; if the answer then says under 13, backup stops
before its next request.

If you believe a child has created an account, contact us and we'll delete it.

## 10. Security

Data is encrypted in transit (HTTPS), and our hosting provider encrypts its
disks. Server-side, each account can read only its own rows. The database
enforces that, not just the app. On your phone, the app sets its database to
overwrite deleted text rather than only mark it deleted. No system is
perfectly secure, but we collect as little as we can, partly so there's less
to protect.

On your iPhone, the app keeps your sign-in session (the tokens that keep you
signed in, stored with your account's basic details such as its email address)
in the iOS Keychain. It can be read only after the iPhone has been
unlocked once since it was turned on, and it is never moved to another phone,
even through a backup. If the Keychain can't be used, the app keeps the
session in its own storage on the phone instead, as earlier versions did.

If you turn on the app's lock (**You → Lock with Face ID**, named for how your
iPhone unlocks), your iPhone does the checking, with Face ID, Touch ID or your
passcode. Fairly Sure learns only whether the check passed and which of these
your iPhone has set up. It never sees your face, your fingerprint or your
passcode, and nothing about the check is sent to us.

## 11. Changes

If this policy changes in a way that matters, we'll say so in the app before it
takes effect. The effective date at the top always reflects the current
version.

## 12. Contact

Jason Zou · tapjason-dev@gmail.com
