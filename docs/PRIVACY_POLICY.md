<!--
DRAFT — not yet published. Before hosting:
  1. Fill every [BRACKETED] placeholder.
  2. Ship account deletion (docs/ACCOUNT_SPEC.md §3); §7 below describes it.
  3. If the app's name changes (see docs/APP_STORE_LISTING.md), update it here.
  4. Re-derive against docs/APP_PRIVACY.md. If they disagree, the code is right.
  5. This is not legal advice. Have it read by someone qualified if you can.
-->

# Calibrate Privacy Policy

**Effective:** [DATE] · **Contact:** [CONTACT EMAIL]

Calibrate ("the app") is made by [DEVELOPER NAME] ("we"). This policy says what
the app collects, why, who else handles it, and how to delete it. It's written
to be read, not skimmed past.

## 1. The short version

- **Without an account, nothing leaves your phone.** You can log, resolve,
  score, and share predictions entirely offline.
- **With an account, your predictions are backed up to our server** so they
  survive a new phone. That includes their text.
- **We don't sell your data, show ads, or track you across other apps or
  websites.** The app contains no advertising or third-party analytics SDK.
- **The AI Coach sees numbers, never your words.** It receives calibration
  statistics only. It is technically unable to send the text of a prediction or
  reflection, because the data it's built from has no field for text.
- **You can delete your account and all of its data from inside the app.**

## 2. What we collect

### If you don't sign in
Nothing. Your predictions, results, and settings are stored in a database on
your device. Usage events (§2.3) are recorded on the device but never sent.

### If you create an account

**2.1 Account information.** Your email address, or, if you use Sign in with
Apple, the address Apple gives us, which may be a private relay address. We use
it only to sign you in.

**2.2 Your predictions.** The text of each prediction, its category, the
confidence you gave it, its due date, how it resolved, and any reflection you
wrote. We store these so you can restore them on another device. We don't read,
analyze, or share them.

**2.3 Usage events.** A small, fixed list of in-app events, such as "warmup
started", "prediction logged", "share completed" and "paywall viewed". Each
carries only numbers or yes/no values (for example, the confidence you chose,
not what you predicted). They tell us whether the app works for people. The
full list:

`warmup_started`, `warmup_completed`, `share_opened`, `share_completed`,
`prediction_logged`, `prediction_resolved`, `paywall_viewed`,
`purchase_completed`, `purchase_abandoned`, `coverage_nudge_shown`,
`coverage_nudge_accepted`, `coach_requested`, `data_exported`.

These are linked to your account. **You can turn them off** in Settings →
Anonymous usage stats.

**2.4 Purchase status.** Whether you have Calibrate Plus, which plan, and when it
renews or ends. We receive this from our subscription provider (§4). We never
see your payment details.

**2.5 Coach usage count.** If you use the Coach, a daily count of requests, to
enforce usage limits.

### What we never collect
Location, contacts, health or fitness data, financial accounts, photos, your
device's advertising identifier, or crash reports. "Health" and "finance" in
Calibrate are labels you choose for your own predictions. The app doesn't
connect to any health or financial service.

## 3. The AI Coach (Calibrate Plus, off by default)

The Coach is optional and is turned off until you switch it on. When you tap
**Get feedback**, the app sends our server a summary of your statistics: your
overall calibration score, and for each category the number of resolved
predictions, the category's score, the average confidence, the rate of
predictions that came true, and a few patterns computed from those numbers
(such as which weekday you're least accurate on). **No prediction text, no
reflections, no email address.**

Our server forwards that summary to OpenAI to generate the feedback. OpenAI
processes it under its API terms, which state that API data isn't used to train
their models by default.

Before any Coach request, the app checks your predictions and reflections **on
your device** for signs of distress. If it finds any, it shows you support resources instead of
contacting the Coach. That check never sends your text anywhere.

## 4. Who else handles your data

| Service | What it receives | Why |
|---|---|---|
| **Supabase** (database and sign-in; servers in the United States) | Everything in §2.1–2.5 | Stores your account and backed-up predictions |
| **OpenAI** | The statistics summary in §3, only when you request Coach feedback | Generates Coach feedback |
| **RevenueCat** | An account identifier and your App Store purchase records | Manages subscriptions |
| **Apple** | Payments, and sign-in if you use Sign in with Apple | App Store billing and authentication |

We share data with these providers only to run the app. We don't sell or rent
personal data, and we don't share it for advertising.

## 5. Notifications

Reminders are scheduled **on your device**. We don't collect a push token and
we don't send notifications from a server.

## 6. How long we keep it

As long as your account exists. When you delete your account, your data is
removed as described in §7.

## 7. Deleting your account

In the app: **Settings → Account → Delete account.** This permanently deletes:

- your account and email address,
- all backed-up predictions and reflections,
- your usage events and Coach usage count,
- your subscription record at RevenueCat,
- and the copy of your data on that device.

If you signed in with Apple, we also revoke the app's access to your Apple ID.

**Deleting your account doesn't cancel an App Store subscription.** Apple bills
it, so cancel it first in Settings → [your name] → Subscriptions, or the app
will point you there.

Without an account, **Settings → Erase all data on this device** removes
everything the app stored.

You can also email [CONTACT EMAIL] to request deletion or a copy of your data.

## 8. Your rights

Depending on where you live (for example, under the GDPR in the EU/UK or the
CCPA in California), you may have the right to access, correct, export, or
delete your personal data, and to object to or restrict its processing. You can
export your predictions yourself as CSV (Calibrate Plus) or ask us for a copy at
[CONTACT EMAIL]. We'll respond within 30 days. We don't sell personal
information as the CCPA defines it.

## 9. Children

Calibrate is not directed to children under 13, and we don't knowingly collect
their personal information. If you believe a child has created an account,
contact us and we'll delete it.

## 10. Security

Data is encrypted in transit (HTTPS). Server-side, each account can read only
its own rows. The database enforces that, not just the app. No system is
perfectly secure, but we collect as little as we can, partly so there's less
to protect.

## 11. Changes

If this policy changes in a way that matters, we'll say so in the app before it
takes effect. The effective date at the top always reflects the current
version.

## 12. Contact

[DEVELOPER NAME] · [CONTACT EMAIL]
