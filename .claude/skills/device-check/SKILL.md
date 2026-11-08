---
name: device-check
description: Write the owner's iPhone checklist for what changed since the last confirmed device run - whether a reload is enough or a new development build is needed, the exact steps on the phone, and what "pass" looks like - then record the results the owner reports in HANDOFF.md and docs/HUMAN_VERIFICATION.md. Use after a step or fix with any native or layout effect, and whenever the owner sends device screenshots or results.
argument-hint: "[optional: 'record' plus the owner's results, or a range like master..HEAD]"
---

The iPhone is the only place this app really runs (`docs/app-profile.md` §18): an iPhone 17 on iOS 26, a development build, the PC serving JS over `--tunnel`. Agents can't see it; the owner can. This skill turns a change into checks the owner can do in a few minutes, and turns their answers into the record.

## Writing the checklist

1. Read `HANDOFF.md` (what is confirmed on the phone, what isn't) and `docs/app-profile.md` §18. Find the changes since the last confirmed device run (`git log` on the range given, or since the commit HANDOFF names).
2. **Reload or rebuild.** A change to `package.json` native packages, an `app.json` plugin, an entitlement or an Info.plist key needs a new development build (`/build development`). Anything else needs only a reload: on the PC, `npx expo start --dev-client --tunnel` (add `--clear` if a fix doesn't show), then shake the phone → Reload, or press `r` in the terminal.
3. **One check per change**, in the owner's words, each with:
   - where to go (tab, row, button, as the screen labels it);
   - what to do (including the appearance, the text size in Settings → Display & Brightness → Text Size, VoiceOver on or off, landscape);
   - what "pass" looks like, concretely ("the switch sits on the label's line, centred on it");
   - what to send back (a screenshot of which screen, or yes / no).
   Include the native pieces the change touches: haptics, sheets and their swipe-down, the keyboard, pickers, notifications (a prediction due today, the time set a few minutes ahead), the share sheet, Sign in with Apple, purchases in sandbox, VoiceOver announcements. Carry forward earlier checks HANDOFF still lists as not re-checked.
4. Order them so the quickest come first, and keep the list short enough for one sitting. Say how long it should take.

## Recording results (`record`)

5. For each result: confirmed → move it to "Confirmed on the phone (<date>)" in `HANDOFF.md` and tick the matching box in `docs/HUMAN_VERIFICATION.md` (Batch C, D) with the date; failed → a bug with the owner's screenshot described in words, the suspected cause, and the next step in `HANDOFF.md`. Never mark something confirmed that the owner didn't report.
6. A device-only bug also gets a line in `docs/app-profile.md` §18 "Known iOS-vs-web traps" once its cause is understood, and in `docs/tooling-notes.md` if it cost time to diagnose.

Never claim a native behaviour works from a web run, a test or a reading of the code.
