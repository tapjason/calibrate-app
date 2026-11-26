# You page redesign (1.2.0)

**Status:** approved as a draft by the owner on 2026-11-25 ("The profile summary looks really good, and all
the refined pages look good as well"), queued for 1.2.0. He reviews the built page before any of it is
committed. Covers his notes #8, 9, 13–16, 25–27, 29, 31, 32 and 34 (`OWNER_UI_NOTES_2026-11.md`). Modelled on
WhatsApp's settings: a profile on top, then one row per category, each opening its own page.

## Profile summary (the top card)
- The rating in large type ("84"). While calibrating: "Calibrating · 12 of 20 scored answers".
- One line: "6-day streak · Silver in health". The streak only while its switch is on; a badge only once
  earned (the 20-answer gate, D27).
- "Guest on this phone" or "Signed in with Apple".
- One **Share** button (the owner, 2026-11-25: Share card and See your week open the same sheet, so one
  button). It opens Share; the week is its second slide. It replaces the "Your card" row.

## Fairly Sure Plus (one row under the summary)
- A free user sees "Try free"; the row opens the paywall.
- A subscriber sees "Active"; the row opens a Plus page: the Coach switch, Manage subscription, Restore
  purchases.

## Settings (icon, name and the current setting on each row; each opens its own page)

| Row | Shows | Its page holds |
|---|---|---|
| Categories | "7" | the current Categories screen |
| Notifications | "On" | the Notifications switch; due-day reminders and their time; the weekly digest and its day and time |
| Appearance | "System" | System / Light / Dark (new: a stored override; share cards keep their fixed palettes, "Share cards keep their own colours."); the streak and daily goal switch |
| Privacy | "Face ID on" | Lock with Face ID and Lock after |
| Help | | How scoring works, Help and support, Privacy policy, Terms of use |
| Advanced | | Usage stats ("A few counts, never your words."; here by the owner's call, 2026-11-25); Export predictions (CSV) |

## Account (the bottom)
- Guest: **Sign in** ("Back up and use on another phone."), then **Erase your data on this phone**.
- Signed in: "Signed in as …", **Sign out**, **Delete account**.
- Footer: the version and build ("Fairly Sure 1.2.0 (n)").

## Gone from You
The "Your card" row and the long explanations (Hide the words, the reminder-words switch and the practice
reminder already went in D79). Explanations move into each row's page, one line at most.

## Rules it keeps
- Delete account and Restore purchases stay easy to reach (Apple 5.1.1(v), 3.1.1).
- Under the under-13 rule (D70): no Plus row, no usage stats in Advanced, and one plain line in place of Sign in; the
  page explaining it keeps where an existing subscription is managed (D72 (c)).
- Sign-out's and Erase's confirmations and counts (D69, D71) unchanged.
- Usage stats keep their consent rules, the Canada default included (D71 (d), D72 (b)).
- The lock's "Lock after" (D75) and the reminder times (D38) move pages, not behaviour.

## Build order
1. The page map and the profile summary, with every existing setting moved into its row's page.
2. Appearance's System / Light / Dark (the only new behaviour).
3. Cut the copy to one line per row.

## Before building
A `/design` pass to turn this into a D number, a check that every setting on today's You has a home, and a
clickable web mock for the owner's review (his call, 2026-11-25), not committed, before any real build.
