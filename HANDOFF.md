# Handoff

**Branch:** `builder/playtest-limits`, from `builder/agent-harness` (01315f6, the agent harness). Nothing pushed; `builder/agent-harness`, `builder/device-fixes`, `builder/expo-fix`, `builder/score-holes`, `builder/build-prep` and `master` are still local only.

## What this PR did

Step 160: the fixes from the seventh blind playtest round (`docs/design/research/playtest-2026-11-08.md`), groups 1, 2, 3, 5 and 7. JS only: a reload on the phone, no new build. The full list is the step's row in `docs/design/BUILT_LOG.md`.

- **Long names and large text (findings 1–4, 9):**
  - Category names keep to one line with an ellipsis everywhere.
  - Fixed-width items (the practice row's "Start", the badge pill) wrap under the words at large text instead of squeezing them.
  - Switches keep their size beside a wrapping label.
  - Categories rows fit at 320.
  - The chart thins tick labels and keeps its n= labels off the region labels.
  - The day pills wrap; the range cells break instead of truncating.
- **Structure (7, 8, 13):**
  - History's filters scroll with the list (the list scrolls to the top on a new filter, so the strip keeps its place).
  - The card preview is capped at 80% of the window's height.
  - Log and Edit show six categories plus "N more" past eight.
- **Dates and limits (6, 20, 21):**
  - Pick a date stops two years ahead (the pickers only; the store doesn't clamp).
  - Dates show their year when it isn't this year's (`src/components/ui/dates.ts`).
  - Text fields count down near their limit and say it once reached.
  - The last card category and the last offered category say why they stay on; hidden categories are dimmed.
- **Card (14, 15):** the gap above the footer is kept, and shrunk content keeps the footer's left edge.
- **VoiceOver (38–41):**
  - Resolve announces what it recorded or changed; Categories announces renames and additions.
  - Can't tell's note is in its label.
  - History rows read only the start of a long note.
  - Hebrew and Arabic titles use their own voice on Resolve and the details.
- **Not changed, on purpose:**
  - Share stays above the card settings (finding 17). The code records the placement as deliberate; moving it is the owner's call.
  - The Story card keeps its bottom safe band.
- **Review:** `code-reviewer` found no blockers in either round.
  - Round 1's seven should-fix items are fixed in 62e77dd.
  - Round 2's one should-fix item is fixed in the last commit: the category icon could be left alone on its own line at the largest sizes, and now stays with the name.
  - No `record-auditor` or `policy-auditor` run: nothing touches a score, count, data or store copy.

## In progress / broken

- **Seen on web** (2026-11-08) at 320 and 375 wide, light and dark, and the card at 568 × 320, with eleven categories and a 24-character name. Screenshots in `.playwright-mcp/step160/` (git-ignored). The check found two problems, both fixed in the last commit:
  - Categories rows: at 320 the iOS 26 switch (63pt, the web's is 40) left the name about 33pt, under its 48pt floor, so the switch would have wrapped. Gaps after the name are 4pt, and the Rename pill and the row edge are 4pt slimmer. Measured on web with the switch forced to 63pt: every row stays on one line and the name gets 57pt, so at 320 "Finance" and "Personal" end in "…" (only a mini with Display Zoom is 320 wide). Every built-in fits from 375. The icon editor under a row is now inset 12pt too.
  - History: a filter with nothing to list rendered the filter strip outside the list, so it remounted, scrolled back to "All" and hid the chosen chip. The list now stays mounted and shows the empty state inside it.
- **Finding 41 in list rows:** Today's and History's rows read the title inside one mixed-language label, so the Hebrew/Arabic voice applies only on Resolve and the details.
- **Known small gaps (review nits, not fixed):**
  - After "N more" is tapped, VoiceOver focus has nowhere to go.
  - A prediction already due past the new maximum opens Edit with the iOS picker clamped to the maximum while "Due …" shows the stored date. Nothing is saved unless a date is picked.
  - Wrapped day pills on a second row grow to fill it.
- **Carried over from `builder/device-fixes`, still open on the phone:**
  - Your card → This week / This year (the absolute-canvas fix): not re-checked.
  - You's switch rows (the switch on the label's line): not re-checked.
  - The Practice sheet: not reported.

## Next step

- **Owner, on the iPhone** (reload; `/device-check` can write the full list):
  1. Settings → Accessibility → Display & Text Size → Larger Text, at the largest size. Check that Today's practice row, Insights' category rows, You's switches, Categories and the digest's day pills read as words, not letter by letter.
  2. Add a category with a 24-character name (e.g. "WWWWWWWWWWWWWWWWWWWWWWWW"). Check that Log, Today, History, Insights and Categories show it with "…" inside the screen.
  3. Add categories until there are ten or more. Log shows six plus "N more". In History, scroll the filter strip right and tap a chip: the strip stays where it was.
  4. Your card in landscape: the whole card is visible; Story too.
  5. Pick a date: nothing past two years from today.
  6. With VoiceOver on, answer a prediction Yes. It says "Recorded: it happened".
  7. The reminder test: two predictions are due tomorrow.
- **Agent:**
  - Then steps 157–159.
  - Groups 4 and 6 of the playtest wait on the owner (`/design`).

## Read first

`HANDOFF.md`, `CLAUDE.md`, `docs/app-profile.md`, `docs/agent-harness.md`, `docs/NEXT_STEPS.md`, `docs/HUMAN_VERIFICATION.md`.

## Open decisions

- **Owner:**
  - pricing (P1);
  - EU trader status;
  - Pages;
  - the domain;
  - email confirmation for strangers;
  - the 2026-11-08 playtest's group 4 (Insights' hierarchy, the 70/85/90 meter's label, the recap's lead) and group 6 (sheet headers, vocabulary, formats);
  - finding 17: Share above or below the card's settings.

## Checks

- `bash scripts/check.sh` must end in `CHECK PASSED`. It does: 152 suites, 1763 tests.
- `bash scripts/check-harness.sh` must end in `HARNESS CHECK PASSED`. It does.
