> **Raw findings, 2026-11-08 (second round that day).** A functional web pass and
> five blind playtests of the web build after step 160 (`builder/playtest-limits`,
> 2771319), again aimed at the UI's limits: 200% text, the narrowest and widest
> iPhones, very long names and notes, empty and extreme states (a fresh install
> and a 1,001-day streak with 1,000 answers), rapid and double taps, offline and
> slow network, back/forward, keyboard-only and screen-reader order. The testers
> were told to be as judgemental as possible. Where they differ, `CLAUDE.md`,
> `DESIGN_SYSTEM.md` and `UI_ROADMAP.md` win.

# Blind playtests (November 2026, eighth round: limits after step 160)

## Method

Same as `playtest-2026-11-04.md`: each blind run was a fresh agent with only the
Playwright browser tools, no repo and no docs, given a persona, tasks and a fixed
report format, one after another in one browser. Before them, `web-playtester`
ran a functional pass (the step 160 checks, then a fresh install). Screenshots
are in `.playwright-mcp/playtest-2026-11-08b/` (gitignored).

Start states, prepared by the main session between runs:

- **Fresh install** (run 1): SQLite's OPFS file removed from a same-origin
  static page.
- **Extreme record** (runs 2 and 5): a fresh install, the Warmup, then 1,000
  predictions inserted through the dev bundle's module registry, one logged on
  each of the last 1,000 days and answered the next (overconfident at 85–95%),
  every 50th title at the 200-character limit, every 97th note at the
  500-character limit, every 37th "Can't tell", plus three open ones logged
  today. Streak 1,001, two rest days saved. Run 2 also kept run 1's 45 junk
  categories. The script is `.playwright-mcp/seed-extreme.js` (gitignored);
  its titles and notes are cut at exactly 200 and 500 characters, so a word
  cut short at the end of one is the script's, not the app's.
- **Demo data** (runs 3 and 4): a fresh install, the Warmup, then `/dev/seed`.
  Run 4 kept run 3's twenty jokey categories.

Offline and slow network were checked by the main session (the blind agent
can't switch the network). A prediction saved with the network off is there
after a reload, the tabs work offline, and RevenueCat fails silently. A cold
load on a throttled link (1.5 s latency, 50 KB/s) took 66 s, but that's the
multi-megabyte development web bundle; the iPhone app ships its JS in the app.
Not signed in, so no sync was exercised.

Stand-ins: large text through CSS `zoom` 2 and 1.5. Zoom halves the layout
width and **does not raise `fontScale`**, so layouts that switch on
`fontScale` (the confidence control's steppers, above 1.15) never switch on
web. Screen reader through the accessibility tree, keyboard only.

**Web-only, so not ranked below** (checked against the code and
`docs/tooling-notes.md`):

- **The confidence control's −5/+5 covering the number at zoom 2 and 1.5**
  (`web-playtester`, Walt). `ConfidenceControl` puts the steppers below the
  readout when `fontScale > 1.15`. Zoom keeps `fontScale` at 1, so they stay
  inline. A device check is still owed (finding 15).
- **Focus and keyboard (Kofi):**
  - hidden tab screens in the Tab order, and focus left on the old screen;
  - focus dropped to `body` after a sheet opens;
  - Escape closes nothing, and Space does nothing on radios and checkboxes;
  - the date field won't take typing, and the slider won't take focus;
  - every heading is `h1`.
- **"Zero live regions"** (Kofi). `announceForAccessibility` does nothing on
  web. On iOS the app announces "Saved.", Resolve's recorded and changed
  answers, and Categories' renames and additions (step 160).
- **The framework's "Unmatched Route" page and its sitemap** listing
  `dev/seed` (Dana). Web only. The dev routes redirect home in a release
  build.
- **Development-build only:** the 5–15 s cold-load spinner. A double-click on
  a button also selects nearby text.
- **The test setup, not the app:** Back from Today landed on the Warmup
  (Priya), because that browser tab had just been through the Warmup. A
  1,001-day user never has it in their history.
- **Web stand-ins for native controls:**
  - the time inputs overflowing their card at zoom 2;
  - "Share as text" and Export giving no feedback;
  - the white scrollbar strip in dark mode.
- **Landscape:**
  - the layout stretching across 956 wide;
  - the Save bar covering the slider;
  - the chart being taller than the screen;
  - the recap preview at 7 px.

  `app.json` locks the app to portrait. This also means step 160's
  landscape card fix (finding 8 of the last round) covers a case the iPhone
  can't reach, unless iPad or a portrait-unlock is ever added.

| # | Persona | Start | Screen | Verdict | Score |
|---|---|---|---|---|---|
| — | `web-playtester` (functional) | Demo data plus long names, then a fresh install | 320, 375, 440 and 956 wide, zoom 1.5 and 2, both appearances | BROKEN at zoom 2 (the confidence control and the chart labels, both stand-in effects), no app-code console errors, the step 160 checks held | — |
| 1 | Dana, 31, QA engineer | Fresh install | 320 × 568, 440 × 956, 956 × 440, light | "Annoyingly sturdy where it counts, but I still made duplicates, broke an emoji in half, undid a Can't tell by tapping a button and filled my phone with 45 categories I can't ever delete" | 6/10 |
| 2 | Walt, 67, macular degeneration, largest text | Extreme record, plus 45 junk categories | 375 × 812, dark, zoom 2 and 1.5 | "Every one of my thousand answers is there and the sums add up, but at my size the chart turns to mush and the settings break 'Notifications' in half" | 5/10 (8 at normal size) |
| 3 | Rosa, 24, social-media manager, jokey emoji categories | Demo data | 440 × 956, 320 × 568, 956 × 440, light | "My categories are finally my vibe, but I can't put them on my card, the card won't show my emoji, and on a small phone my Categories screen chops every name in half" | 6/10 |
| 4 | Kofi, 45, blind, keyboard and screen reader | Run 3's data | 390 × 844, light, Reduce Motion | "Labels better than most I audit, but focus falls to the bottom of the page after every button and nothing tells me what happened" | 5/10 (mostly web-only) |
| 5 | Priya, 45, product director, three years of data | Extreme record | 402 × 874, then 320 × 568 and 956 × 440, light | "Every number has its receipts, but after three years it can't tell me whether I've got better unless I pay, and two of its own lines contradict each other about where I'm weakest" | 6/10 |

**What held up.**

- **The record reconciled to the unit** across Today, Insights, History, the
  filters, the range drill-down and the recaps:
  - 1,002 answered = 973 scored + 27 Can't tell + 2 same-day;
  - the chart columns and the category rows both sum to 973;
  - the 80–100% filter shows 311 answered, 11 not scored, so 300.
- **No verdict appeared without its counts.** Two opposite verdicts did
  (finding 8).
- **Every text limit is stated when it bites and holds.** Title 200, note
  500, category name 24, each with "n of max, the most it takes".
- **Input attacks held.** Spaces-only titles are blocked with a reason;
  pasted line breaks fold; an 80-character word wraps; Hebrew, Arabic, CJK,
  emoji-only and ZWJ names render everywhere. Duplicate category names are
  blocked whatever the case or spacing. The last category can't be hidden,
  and the app says why.
- **Rapid input held.**
  - Ordinary double taps and double Enter never doubled Save, Yes, Change
    answer, Resolve all or category Add.
  - 15 to 24 fast tab switches always ended on the right tab.
  - A reload mid-sheet restores the sheet.
  - Bad deep links get a page with a Close.
- **Step 160 held in the functional pass:**
  - category names keep to one line with an ellipsis;
  - the practice row and badge pills wrap at zoom 2;
  - Categories fits at 320;
  - History's strip keeps its place on an empty filter;
  - Log shows "N more";
  - Pick a date's maximum works, and dates show their year;
  - the last-category notes and Can't tell's label are in place.
- **Copy held up with the harshest testers.** Same-day and early-answer
  warnings come before the answer. Old answers explain why they're locked.
  Badge rows read as sentences. The chart's text alternative was "the best
  I've heard in a consumer app" (Kofi). Priya called Insights' range-to-History
  drill-down the best moment of her session.

## Ranked findings

Each is checked against the code. "No decision" means the fix doesn't change
what a screen says or how it's arranged; "needs the owner" means it does, or it
touches a decided D number. Device-only behaviour is flagged.

### P1: breaks and record risks

1. **Three Save taps in one instant save three predictions** (Dana; `LogPredictionForm.onSubmit`).
   - The guard is the `submitting` state, which doesn't change until the next
     render, so taps landing in the same frame all run.
   - The copies count toward the daily goal ("Today's goal met").
   - Ordinary double taps were safe.
   - Fix: a ref guard set synchronously at the top of `onSubmit`, and the
     same check on any other create path. *No decision.*
2. **"Answer it now" on a Can't tell reopens it before any answer** (Dana; `ResolvePrompt`, the skipped branch).
   - The button calls `reopen` at once. Leaving without answering turns the
     skip into an open prediction, with nothing said.
   - It is no new score hole: an open prediction can always go unanswered.
     But a tap that looks like navigation changes the record.
   - Fix: show Yes / No with the skip intact, and write only when one is
     tapped. *No decision* (D45's week still applies).
3. **Today's identity line doesn't follow a rename** (Rosa; `IdentityLine` → `buildShareCard` → `categoryLabel`).
   - `categoryLabel` reads `useCategoryStore.getState()`, so nothing
     re-renders the line on a rename. It stayed "Forecaster in personal" until
     she logged something; rows, Insights and the card had already changed.
   - Fix: subscribe to the category defs where the line is built. *No
     decision.*
4. **Double-tapping "N more" in Log selects the chip that slides under the finger** (Rosa; `CategoryChips`).
   - The expansion moves the chips, and the second tap of the double tap
     lands on one, deselecting the chosen category without a word. That
     files a prediction in the wrong category.
   - Likely on iOS too: chips move the same way under a fast double tap.
   - Fix: ignore chip presses for about 300 ms after expanding, or append
     the extra chips so none moves under "N more". *No decision.*
5. **The recaps' badge line can feature a category with no answers** (Walt, Dana; `nextBadgeProgress`).
   - It names the category fewest answers from its next badge. An empty
     category is always 20 away, so once every real category has its count,
     the week and year cards say "Tracker in Extraordinarily long cat: 20 to
     go". A score gate in a real category would be the line to show.
   - Recommendation: skip categories with nothing resolved. *Needs the owner*
     (what a card says).
6. **A name can be cut through an emoji, and the counter counts code units** (Dana; `TextInput maxLength`, `LengthCounter`).
   - "Friends and famil" plus 👩‍👩‍👧‍👦 was saved as half a family while the
     counter said "23 of 24".
   - Whether iOS's own `maxLength` cuts mid-grapheme needs the device. The
     counter's count is wrong on both.
   - Fix: count and cut by grapheme (`Intl.Segmenter`, or a trailing-ZWJ
     trim on save). *No decision.*
7. **Times follow the language, not the phone's 24-hour setting** (the owner's device screenshot, 2026-11-07).
   - Reminder time shows "19:00" (the native picker reads the setting), but
     the descriptions say "at 7:00 PM", "Sunday at 6:00 PM" and "8:00 AM".
     They come from `toLocaleTimeString(undefined, …)`, and en-US is
     12-hour whatever the switch says. The same applies to "Until 8:17 PM
     tomorrow" in a prediction's details and `reminderTimeLabel`.
   - Fix: read `uses24hourClock` from `expo-localization`. That is a new
     native package and needs a new development build. *Needs the owner*
     (install approval).

### P1: hierarchy and story (all need the owner)

8. **"Furthest off" and the category scores contradict each other** (Walt, Priya).
   - Insights says "Furthest off: finance. You said about 61%, and 106 of 194
     happened", while Finance is Sharp at 92 and Health is lowest at 87.
   - Both are right: one is a single-range lean, the other the error across
     ranges. Nothing on screen says so.
   - Separately, a 94 rating sits beside "too sure at 80–100%: 225 of 300,
     about 270 expected".
   - Either explain the difference in one line, or name the furthest-off
     category by the same measure as the score.
9. **Today and the card lead with best plus weakest** ("Oracle in personal · Forecaster in health"; Walt, Priya, Rosa).
   - Testers ask why personal leads over an equal work, and why the weakest
     is on a card they'd post.
   - This is the open "identity line names the weakest second" question,
     now eight runs.
10. **A long-time user can't see improvement without Plus** (Priya).
    - Free gives "No change since last week, from 7 answers". Trends ("your
      32 months on file") is Plus.
    - "This year" is calendar 2026 only, with no score for the year and no
      past years or all-time recap. The year card quotes the all-time social
      score under "This year".
11. **A 1,000-day streak isn't recognised** (Walt, Priya).
    - Checkpoints are 7, 30, 100, 365 and then yearly, so day 1,000 passes
      unremarked.
    - The streak isn't on the share card; it is on the recaps.
    - Nothing says "1,000 predictions since February 2024".
    - The number has no thousands separator ("1001-day streak").
      `streakCopy`, `wrappedCopy` and `CalibrationView` print it raw; adding
      the separator is *no decision*.
12. **Insights' category rows don't open anything** (Priya).
    - She came to see where in health she's off, and a row gives only its
      badge sentence.
    - At least: open History filtered to the category. Better: that
      category's ranges and counts.
13. **History doesn't navigate a long record** (Priya, Walt).
    - Reaching February 2024 took about 97,000 px of scrolling.
    - There are no month or year headers (this year's rows carry no year,
      older ones do) and no jump to a date or search. The filters scroll away.
    - Re-tapping the History tab doesn't scroll to the top: no screen uses
      `useScrollToTop`, so on iOS too. That part is *no decision*.

### P2: large text and narrow screens (iOS-likely)

14. **You's switch rows break words mid-word at the largest sizes** ("Notifica / tions", "Due- / day / reminde / rs"; Walt at zoom 2).
    - The iOS switch keeps its 63 pt while the label grows. At AX5 on 402
      wide, "Notifications" (17 pt × ~3.1) is wider than the room beside it,
      so this happens on the phone too.
    - Fix: above a `fontScale`, put the switch under the label.
    - *No decision*; device check.
15. **The confidence control near its switch-over** (from the web stand-in).
    - At `fontScale` ≤ 1.15 on 360–380 wide, the inline steppers sit beside
      "100%" and the frequency text.
    - Check on the phone at the largest non-accessibility size that "100%"
      and its words stay clear.
    - *Device check.*
16. **Chart and its pills at large text** (`web-playtester`, Walt, Priya).
    - **Real Dynamic Type text:** the range buttons ("277300" run together,
      "80– / 100 / %"), the region pills and the 70/85/90 marks merging into
      "7085".
    - **Fixed-size SVG text:** the n= labels. On the phone they collide only
      when the chart is narrow; Priya saw "n=277" crowd "n=300" at 320 with
      no zoom.
    - Fix: keep each range on one line and give counts a separator; thin or
      drop n= labels when they'd touch a dot or each other, as tick labels
      already do.
    - *No decision.*
17. **Categories at 320 truncates most real names** (Rosa: 13 of 20; Walt, Dana).
    - Since 2771319 the name gets 57 pt on the iPhone at 320. Built-ins
      mostly fit; anyone's own names mostly don't. Rosa's list became
      "Hot girl w…", "Group chat…", "Situations…".
    - Fix: below about 360 wide, let Rename and the switch wrap to a second
      line under a full-width name (the row already wraps at large text).
    - *No decision* (layout only).
18. **Insights' badge rows place their pill inconsistently at 320** (Rosa, Priya).
    - Rows whose name fits keep the pill on the right; others drop it under
      the text, left-aligned.
    - Fix: decide per list, not per row (all rows wrap when any must).
    - *No decision.*
19. **The card preview is too small to check at large text** (Walt).
    - The preview is the 360-wide card scaled to fit; at 200% its chips and
      dots are about 7 px.
    - Offer a full-size view on tap. *Needs the owner* (new behaviour).

### P2: consistency and polish

20. **Edit has no draft guard** (Dana).
    - Log asks before a draft is dropped (`useLogDraftGuard`); a prediction's
      Edit doesn't, so swiping its sheet away on iOS loses the change
      silently.
    - Resolve keeps its note.
    - Fix: apply the guard to Edit. *No decision.*
21. **Many categories** (Dana, Walt, Rosa).
    - **No decision:** expanded "N more" can't be collapsed (add "Show
      fewer"). History's filter strip lists every category, including those
      with nothing in them (52 chips, ~4,000 px); list only categories with
      predictions, plus the chosen one.
    - **Needs the owner (D39):** added categories can be hidden but never
      deleted, and there is no cap.
22. **The Categories switches have no visible label** (Walt, Kofi).
    - "The switch offers a category when you log." sits under the whole list,
      18 screens down at 200%.
    - Move it above the list. *Needs the owner* (arrangement), trivial.
23. **The two-year due-date maximum is never stated** (Dana).
    - Typing 2099 silently becomes Nov 8, 2028; the minimum has its line.
    - Add "Up to two years ahead" beside "Tomorrow at the earliest". *Needs
      the owner* (copy).
24. **Double-tapping "+" opens Log and the second tap closes it** (Dana, Rosa).
    - On web the sheet's Close lands exactly under "+". On iOS the
      page-sheet animation may absorb the second tap.
    - *Device check.* If it reproduces, ignore Close for 300 ms after open.
25. **A ±5 double tap moves once** (Dana).
    - Both taps compute from the rendered value.
    - Fix: read `latest.current ?? middle`, as `set` does. *No decision.*
26. **Emoji icons sit about 3 px left of the text edge**, where built-in symbols line up (Rosa). *No decision.*
27. **Resolve's note box doesn't grow** past 80 px for 500 characters, and a saved note can only be removed, not edited (Rosa).
    - The box growing is *no decision*. Editing a saved note *needs the
      owner* (D34's window).
28. **Built-in names in lower case** in screen-reader labels ("finance, 85% confident"), "Furthest off: finance." and "Show finance on the card" (Kofi, Rosa).
    - It's `categoryLabel`'s mid-sentence form.
    - At a sentence start, use `categoryTitle`. *No decision.*
29. **Screen-reader order and states** (Kofi, iOS-likely).
    - **No decision:**
      - a prediction's details reads "On Nov 4 you said 85%" before the
        title;
      - the icon picker's emoji have no selected state, and "X icon.
        Change" doesn't name the current icon;
      - Today's section headers read "Next 7 days, 7" with no noun;
      - the "it's early" warning before Answer now is text a swipe reaches,
        but it isn't in the button's hint.
    - **Needs the owner:** the card screen's Share buttons come before the
      choices.
    - *Device check:* where VoiceOver focus lands after a sheet opens or an
      answer is recorded.

### P3: needs the owner, copy and policy

30. **"Boldest call that landed: 95%"** (Priya): a 95% call that happens is the safest, not the boldest.
31. **The hidden category is on by default on the card** (Rosa).
32. **The paid themes can't be previewed** before the paywall (Rosa).
33. **"Usage stats" reads as the person's stats**; it's the analytics switch (Priya).
34. **The sign-in nag returns indefinitely** after "Not now" (Priya, D31).
35. **The week recap reads as homework** ("To reach Sharp in …: 19 more resolved and a score above 85 at its low end") and has no Post/Story shape (Rosa).
36. **Decided, recorded for completeness:**
    - the card shows no person's emoji (D40);
    - the card prints "2 categories not shown" (D42);
    - Rosa wanted both changed.
