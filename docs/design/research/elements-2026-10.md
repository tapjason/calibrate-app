> **Raw research, 2026-10-06.** How the best-reviewed apps near Calibrate's category
> choose their UI elements, what their reviewers reward and punish, and what that
> means for Calibrate. Decisions drawn from it live in
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md) (steps 79–81, decisions D15 and D16) and
> [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) (§7.20 and §7.21); where they differ,
> those files win.

# Choosing UI elements: what the top-reviewed apps do (October 2026)

The earlier rounds ([`market.md`](market.md), [`visual-language.md`](visual-language.md),
[`patterns.md`](patterns.md)) chose Calibrate's *look* and designed its surfaces. This
round asks a narrower question: when an app rated 4.7 or higher picks a control (a tab,
a slider, a sheet, a settings row, a confirmation), what does it pick, and what do its
reviewers say about the result?

## 0. Method

Four sources, gathered 2026-10-06.

1. **Eighteen apps** in or near Calibrate's space (self-tracking, journaling, health
   scores, planners), all rated 4.7–4.95 in the US App Store. Ratings come from
   Apple's public iTunes Lookup API on the day (table below).
2. **Their App Store screenshots**: the first six of each, 17 apps viewed (Headspace
   was not). Screenshots are marketing frames, so they show what each developer chose
   to lead with, not every screen.
3. **Their written reviews**: up to 500 of the most recent US reviews per app from the
   public customer-reviews RSS feed, **8,057 reviews** in all (4,899 five-star, 1,874
   one- or two-star, 1,284 in between). Each review's title and text were matched
   against keyword patterns (appendix). Crude by design: it counts mentions, not
   sentiment, in English, from the US store only.
4. **The literature and the platform**: Chen et al. 2021 (the largest study of
   UI-related app reviews), Khalid et al. 2015, Apple's HIG pages (read as their JSON
   on the day), and three Nielsen Norman Group articles.

| App | Category | Rating | Ratings | Reviews read | 5★ / 1–2★ among them |
|---|---|---|---|---|---|
| Headspace | Health & Fitness | 4.84 | 973,819 | 100 | 11 / 65 |
| Finch: Self-Care Pet | Health & Fitness | 4.95 | 760,376 | 500 | 399 / 42 |
| Clue | Health & Fitness | 4.76 | 405,134 | 500 | 164 / 219 |
| Oura | Health & Fitness | 4.86 | 309,089 | 450 | 171 / 183 |
| Structured | Productivity | 4.79 | 167,145 | 500 | 315 / 100 |
| Flighty | Travel | 4.85 | 155,636 | 500 | 385 / 71 |
| Todoist | Productivity | 4.80 | 129,550 | 500 | 299 / 125 |
| Day One | Health & Fitness | 4.83 | 118,450 | 500 | 301 / 117 |
| WHOOP | Health & Fitness | 4.81 | 84,768 | 500 | 280 / 140 |
| Rise | Health & Fitness | 4.73 | 71,220 | 500 | 242 / 200 |
| Daylio | Lifestyle | 4.77 | 61,914 | 500 | 423 / 29 |
| stoic. | Health & Fitness | 4.82 | 35,888 | 500 | 335 / 82 |
| How We Feel | Health & Fitness | 4.87 | 29,930 | 500 | 429 / 20 |
| Things 3 | Productivity | 4.82 | 27,995 | 250 | 157 / 46 |
| Streaks | Health & Fitness | 4.81 | 27,350 | 500 | 256 / 125 |
| Bevel | Health & Fitness | 4.85 | 16,880 | 500 | 307 / 130 |
| Gentler Streak | Health & Fitness | 4.71 | 8,823 | 500 | 260 / 134 |
| (Not Boring) Habits | Health & Fitness | 4.78 | 6,236 | 257 | 165 / 46 |

**The first finding is in this table.** Every app sits at 4.7 or above, yet only 61%
of the recent *written* reviews are five-star and 23% are one or two. Written reviews
lean angry; most of the stars come from people who rate without writing. The likely
source (an inference, not measured here) is the system's rating prompt, which asks
people mid-use and takes a star in one tap (§3.10). These apps don't hold 4.8 by
avoiding complaints; they hold it by hearing from the satisfied majority too.

## 1. What reviewers reward and punish

Share of five-star and of one/two-star reviews that mention each theme:

| Theme | 5★ | 1–2★ | Ratio |
|---|---|---|---|
| Easy / intuitive | 13.3% | 4.7% | 2.8 |
| Looks: design, beautiful, cute | 11.5% | 8.3% | 1.4 |
| Charts / insights / data | 10.7% | 14.6% | 0.74 |
| Paywall / subscription / price | 9.0% | **34.0%** | 0.26 |
| Simple / clean / minimal | 8.0% | 3.5% | 2.3 |
| Fun / satisfying / delight / haptics | 5.9% | 0.9% | **6.5** |
| Notifications / reminders | 4.8% | 5.9% | 0.81 |
| Streaks | 3.9% | 2.3% | 1.7 |
| Widgets / Watch | 3.8% | 4.2% | 0.91 |
| Customisation / themes / dark mode | 3.5% | 1.5% | 2.3 |
| Quick / few taps | 2.4% | 1.7% | 1.4 |
| Bugs / crashes / sync / data loss | 2.3% | 10.0% | 0.23 |
| Confusing / cluttered / hard to find | 2.1% | 5.0% | 0.42 |
| **UI changed in an update** | 0.8% | 6.1% | **0.12** |
| Privacy | 0.4% | 1.3% | 0.29 |

What stands out:

1. **"Easy to use" is the praise.** The exact phrase appears in 204 of the 4,899
   five-star reviews, far ahead of "easy to understand" and "easy to navigate" (under
   20 each). Ease and simplicity are 2–3 times likelier in a five-star review.
2. **Delight is the most lopsided praise (6.5×), and it clusters.** Of the 229
   five-star reviews that say fun, satisfying, delight, haptics or animation, two
   thirds belong to four apps: Finch (71), (Not Boring) Habits (35), Flighty (25) and
   Daylio (21). A character, a completion that feels physical, a live status that
   keeps up.
3. **A changed UI is the most lopsided complaint (0.12).** "The new layout is
   confusing and not something I find easy to use like the previous version" (Streaks,
   1★, titled "Want the old views back"). Clue alone has 27 such low reviews and Day
   One 17. Chen et al. found the same at scale (§2): a review comparing
   the UI with a previous version or a competitor is 1–2★ **90%** of the time, the most
   negative of all seventeen UI issue types.
4. **Money is the largest complaint, a third of all low reviews.** Inside it, billing
   leads: 30% of the money complaints mention a charge, a trial, cancelling or a
   refund, 25% the price, and only 6% that something "used to be free". A Bevel
   reviewer: "they stress that they will notify you before your subscription renews. I
   did not receive a push notification, an email or any other form of contact." Clue's
   low reviews show the other failure: opening the app "to track one (1) piece of
   information will trigger at least 3 pop-ups begging", and "they even hide the X to
   get out of the ads in the corner".
5. **Bugs, sync and lost data** are a tenth of low reviews and nearly absent from high
   ones (0.23).
6. **Minimal is not the same as easy.** Streaks, the most pared-down app in the set
   (icon tiles, pages, long-press options), collects the most "confusing" and
   "unintuitive" low reviews (19 of its 125): "it is trying too hard to be simple and
   ends up being unintuitive to use"; "more complicated than its simple look".
7. **Charts, insights and data lean negative (0.74).** Of the 273 low reviews that
   mention them, 79 are about paying for them, 65 about data lost or not syncing, and
   35 about numbers that seem wrong ("data incorrect and makes up data", WHOOP).
8. **Notifications are neutral until they sell.** Clue's notification complaints are
   about marketing pushes ("80% of notifications are about 'limited time offers'"),
   and about getting daily prompts but not the one reminder the user opted in to.

## 2. What the literature says about UI complaints

- **Chen et al. 2021** (ACM TOSEM 30(3):37) collected 3.3M UI-related reviews from
  31,578 top Google Play apps and hand-labelled a sample of 1,447 into 17 issue types.
  UI-related reviews carry lower ratings than an app's other reviews. Share of the
  sample, and the share of each type that is 1–2★ (Table 6):

  | Issue type | Share | 1–2★ |
  |---|---|---|
  | Comparative (vs an earlier version or another app) | 9.8% | **0.90** |
  | Advertisement | 3.7% | 0.66 |
  | Gesture | 4.8% | 0.57 |
  | Feedback (no clear, timely status) | 6.5% | 0.53 |
  | Layout | 4.3% | 0.44 |
  | Redundancy (bloat, repeated features) | 7.7% | 0.43 |
  | Notification (absent or abused) | 8.1% | 0.38 |
  | Navigation | 5.2% | 0.35 |
  | Design specification (breaks the platform's expected look or behaviour) | 6.6% (13.4% in paid apps) | 0.29 |
  | Customization (wants themes, fonts, colours) | 7.4% | 0.22 |
  | Generic ("ugly", "love the UI") | 16.0% | 0.16 |

  The paper's examples are telling: "Bring back the material design"; "I find the UI
  clunky and very common buttons are hidden instead of easily accessible"; a motion
  complaint about an app that "vibrates incessantly and unnecessarily as you scroll".
- **Khalid et al. 2015** (IEEE Software 32(3)), 6,390 one- and two-star reviews of 20
  free iOS apps: functional errors, feature requests and crashes are the most frequent
  complaints, but **hidden costs and privacy** are the ones that hurt ratings most. Our
  sample agrees: price and billing are a third of low reviews, privacy is rare but
  lopsided (0.29).

## 3. What the top apps choose, element by element

From the screenshots of the 17 apps viewed, with the HIG's own rule beside each.

### 3.1 Navigation

- **Three to five labelled tabs, or none.** Oura has three (Today, Vitals, My Health)
  on a floating Liquid Glass bar; Gentler Streak four; Structured four; Daylio, Rise
  and Clue five. Streaks, Things 3, How We Feel and (Not Boring) Habits have no tab
  bar at all. Every tab shown carries a word under its symbol.
- **Settings is rarely a tab.** It sits behind a gear or avatar icon in How We Feel,
  Todoist, Oura, Rise and Day One (in the header) and Streaks (a corner); only Structured (a Settings tab)
  and Daylio (a "More" tab) spend a tab on it.
- HIG, Tab bars: "Use a tab bar to support navigation, not to provide actions… If you
  need to provide controls that act on elements in the current view, use a toolbar
  instead." "Include tab labels… Use single words whenever possible." "Don't disable
  or hide tab bar buttons."
- NN/g (179 users, six sites): on the site whose navigation was visible, 89% of
  people used it; on the one that hid it behind a menu, 44% did, and they took longer
  to get there (24 vs 33 s).

### 3.2 The add action

None of the nine apps whose screenshots show how an entry starts uses an ordinary tab
for it. Daylio and Clue put a centred "+" inside the tab bar; Oura and Structured float
a separate "+" beside the bar; Things 3 and Day One float a "+" over the content; How We
Feel puts it in the header; Streaks and Rise make "Add" a tile or row in the list
itself. Calibrate's **Log** is a tab like Home and Stats, which is decision **D3**'s
point (a tinted "+" opening a sheet).

### 3.3 Picking a value

- **Short scales are discrete taps.** Daylio and stoic. log mood with five faces;
  Structured uses a segmented control (Once · Daily · Weekly · Monthly) and a stepper
  (− / +); How We Feel lays emotions out as a colour field. No app in the set leads
  with a slider as its logging input.
- HIG, Sliders: "Consider supplementing a slider with a corresponding text field and
  stepper… Adding a stepper provides a convenient way for people to increment in whole
  values." Calibrate's confidence is a 21-step scale (0–100 by 5), long for buttons and
  exactly the case a slider plus stepper is for. The confidence research
  ([`confidence-2026-10.md`](confidence-2026-10.md) §2) covers the alternatives; this
  round adds nothing that argues for changing it.

### 3.4 Filters and segmented choices

- **Scrolling pills filter a list.** Day One (All · Photo · Video · Audio · PDF),
  Flighty (All · Jake · Mom), Bevel's chart metrics. Calibrate's History does the same.
- **Segmented controls switch closely related views.** Day One's List · Calendar ·
  Media · Map; Structured's repeat picker. HIG: "Aim for… no more than about five
  segments on iPhone"; "Prefer using either text or images — not a mix of both"; "For
  switching between completely separate sections of an app, use a tab bar instead."
  Calibrate's Card · This week · This year and Post · Story fit.

### 3.5 Sheets

- **Every sheet shown has a visible ×** (Daylio's entry, Finch, Bevel, Todoist, Things'
  quick entry), with the confirm action (Save, a tinted ✓) at the top trailing edge or
  as one full-width button at the bottom.
- HIG, Sheets: "for sheets with a single view, the Cancel button belongs on the leading
  edge of the top toolbar. When present, the Done button belongs on the trailing edge."
  "Support swiping to dismiss a sheet." HIG, Toolbars: "Use the standard Back and
  Close buttons… don't use a text label that says Back or Close"; "Use the .prominent
  style for key actions such as Done or Submit… Only specify one primary action."
- NN/g, Bottom sheets: "provide a clear Close button (usually styled as an X or the
  word Close) at the top of bottom sheets rather than relying exclusively on the grab
  handle."
- **Calibrate:** the Resolve sheet (single and run) has no visible close until an
  answer is given: on iOS the grabber and a swipe, on web nothing but the browser's
  Back. Share and How scoring works close only with a full-width **Done** at the
  bottom of a long scroll. → Step 79.

### 3.6 Settings

- **Grouped inset lists.** Streaks' task settings and Todoist's Display screen: rows
  that open something carry a chevron and often the current value ("Grouping ·
  Project ›"); on/off rows end in a switch; a single choice among rows takes a
  checkmark. The whole row is the target.
- HIG, Lists and tables: "If you need to let people drill into a list or table row's
  subviews, use a disclosure indicator." HIG, Settings: "Minimize the number of
  settings you offer", and "prefer letting people modify task-specific options without
  going to your settings area".
- **Calibrate:** each Settings row puts a capsule button at its trailing edge (Sign in,
  See Plus, Read), so the screen shows three outlined buttons beside three switches,
  and only the capsule is tappable. That is the "design specification" kind of
  complaint in Chen et al. (a familiar platform pattern done differently). → Step 80.

### 3.7 Destructive confirmations

- HIG, Buttons: "Don't assign the primary role to a button that performs a destructive
  action, even if that action is the most likely choice. Because of its visual
  prominence, people sometimes choose a primary button without reading it first."
  HIG, Alerts: "Always use the title 'Cancel' for a button that cancels"; Cancel
  belongs at the bottom of a stack.
- **Calibrate:** the Erase / Delete account screen leads with a filled red **Erase
  everything** capsule, the most prominent control in the app's palette, for its one
  irreversible action. → Step 81: an outlined capsule with a destructive label, Cancel
  beneath it, so nothing on the screen is a filled primary.

### 3.8 Scores

- WHOOP, Bevel and Oura draw the hero score as a **ring or arc** with the number inside
  and a word under it ("Recovery", "Optimal", "Recovered"); every detail screen has an
  ⓘ in its header. Gentler Streak pairs each metric with a word ("Excellent",
  "Normal").
- Calibrate keeps its bullet bar (DESIGN_SYSTEM §7.1, "No gauges"), a deliberate
  departure: a ring reads as progress toward 100, while calibration bands (70 / 85 / 90)
  are thresholds, which a bullet graph shows and a ring hides. The word beside the
  number, and "How is this scored?" one tap from it, match what these apps do.

### 3.9 Labels and gestures

- Every tab, chip and filter in the set carries a word. Icon-only controls appear where
  the art carries the meaning (Streaks' task tiles), and that app collects the
  confusion complaints (§1.6).
- NN/g, Icon usability: "Icon labels should be visible at all times, without any
  interaction from the user"; only home, print and search are near-universal.
- Gesture complaints are 1–2★ 57% of the time (Chen et al.). In our sample, swipe,
  long-press and "accidentally" are mentioned in 0.8% of low reviews and 0.3% of high
  ones. Calibrate has no gesture-only action; keep it that way.

### 3.10 Asking for ratings

- HIG, Ratings and reviews: "Ask for a rating only after people have demonstrated
  engagement… Avoid asking for a rating on first launch or during onboarding"; "Avoid
  interrupting people while they're performing a task"; "Prefer the system-provided
  prompt"; the system shows it at most three times in 365 days.
- An Appbot experiment on two apps that moved the system prompt earlier (after one
  completed workout rather than several) saw ratings per month rise by more than 400%
  with the average holding at about 4.84; the other app's average rose.
- `expo-store-review` wraps the system prompt (`requestReview()`); its docs say not to
  call it from a button, only after a signature interaction.
- **Calibrate never asks.** Its stars would come only from people who go to the store
  unprompted, the population §0 shows skews negative. → Decision **D15**.

## 4. What this means for Calibrate

| # | Finding | Evidence | Became |
|---|---|---|---|
| R1 | Resolve has no visible close before an answer; Share and How scoring works close only from the bottom | HIG Sheets and Toolbars, NN/g bottom sheets, 5 of 5 sheets in the set | Step 79 |
| R2 | Settings rows hide their target in a capsule; no chevrons | HIG Lists, Streaks and Todoist, Chen "design specification" | Step 80, DESIGN_SYSTEM §7.21 |
| R3 | The Erase screen's destructive action is a filled primary | HIG Buttons and Alerts | Step 81 |
| R4 | No rating prompt | §0 table, HIG Ratings, Appbot | Decision **D15** |
| R5 | Billing is the largest single complaint; the paywall's timeline promises no reminder because none exists | §1.4 (189 low reviews on charges, trials, cancelling or refunds) | Decision **D16** |
| R6 | A changed UI is the most punished change after launch | §1.3, Chen "Comparative" 0.90 | D3, D1 and D7 sequenced before the first public release (UI_ROADMAP §2) |
| R7 | Log is a tab; Settings is a tab | §3.1, §3.2, HIG Tab bars | Already decision **D3**; evidence added |
| R8 | Upsells that interrupt are what sink well-loved apps (Clue) | §1.4, §1.8 | A rule in DESIGN_SYSTEM §7.6: no pop-ups, never on launch, one teaser per screen, × always visible |
| R9 | Delight is the most lopsided praise, and it comes from character and physical completion | §1.2 | Supports building FUTURE_UI B1 (checkpoint celebration) when a device is available; no change now |
| R10 | Customisation and dark mode lean positive (2.3×); Chen's "customization" reviews are requests (0.22) | §1, §2 | Evidence added to **D7** (dark mode) and to Plus's card themes |
| R11 | Keep: labelled chips and pills, the slider with ±5, segmented Share tabs, the bullet bar | §3.3, §3.4, §3.8 | No change; DESIGN_SYSTEM §7.20 records why |

## Appendix: theme patterns

Case-insensitive, matched against title and text. A review counts once per theme.

| Theme | Pattern (abridged) |
|---|---|
| Easy / intuitive | easy, easily, intuitive, effortless, user-friendly |
| Simple / clean / minimal | simple, simplicity, minimal(ist), clean, uncluttered, straightforward, no fluff |
| Quick / few taps | quick(ly), fast, in seconds, one tap, few taps |
| Looks | beautiful, gorgeous, aesthetic, design(ed), interface, ui, pretty, cute, adorable, sleek, elegant |
| Charts / insights / data | chart(s), graph(s), stats, statistics, insight(s), trend(s), pattern(s), data |
| Widgets / Watch | widget(s), apple watch, watch app, lock screen |
| Customisation | dark mode, theme(s), customise/customize…, personalise… |
| Notifications | notification(s), reminder(s), remind(s) |
| Fun / delight | fun, satisfying, delight(ful), haptic(s), animation(s), motivating/motivation |
| Confusing | cluttered, confusing/confused, hard to find/use/navigate, too many taps/steps, unintuitive, buried, overwhelming, complicated |
| UI changed | redesign(ed), new design/layout/ui/look, latest/recent/last/new update, used to be, old version/design, bring back, was better |
| Money | paywall, subscribe/subscription, premium, price, expensive, free trial, pay for, money |
| Bugs | crash…, bug(s), buggy, glitch…, sync…, lost my data/entries/progress, freeze… |
| Privacy | privacy, private |

## Sources

- Apple, iTunes Lookup and Search API (ratings, 2026-10-06): `https://itunes.apple.com/lookup?id=…&country=us`
- Apple, customer reviews RSS feed (recent US reviews, 2026-10-06): `https://itunes.apple.com/us/rss/customerreviews/page=N/id=…/sortby=mostrecent/json`
- Chen, Chen, Hassan, Xing, Xia, Hassan (2021). *How Should I Improve the UI of My App? A Study of User Reviews of Popular Apps in the Google Play.* ACM TOSEM 30(3):37. [PDF](https://chenqiuyuan.com/pdf/Chen_2021_How_Should_I_Improve_the_UI_of_My_App(TOSEM).pdf) · [ACM](https://dl.acm.org/doi/10.1145/3447808)
- Khalid, Shihab, Nagappan, Hassan (2015). *What Do Mobile App Users Complain About?* IEEE Software 32(3). [Semantic Scholar](https://www.semanticscholar.org/paper/96db910399451ea38a816d60d4a70d4e56c2f825)
- Apple HIG, read 2026-10-06: [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) · [Sliders](https://developer.apple.com/design/human-interface-guidelines/sliders) · [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) · [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) · [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) · [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) · [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) · [Settings](https://developer.apple.com/design/human-interface-guidelines/settings) · [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) · [Ratings and reviews](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews)
- Apple, [2026 Apple Design Award winners](https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/) · [ADA Q&A: Moonlitt](https://developer.apple.com/news/?id=v1nphz91) · [Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4) ("We want Flighty to work so well that it feels almost boringly obvious.")
- Nielsen Norman Group: [Hamburger menus and hidden navigation](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/) · [Icon usability](https://www.nngroup.com/articles/icon-usability/) · [Bottom sheets](https://www.nngroup.com/articles/bottom-sheet/)
- Appbot, [You aren't prompting for app ratings and reviews often enough](https://appbot.co/blog/app-ratings-reviews-strategy-experiment/)
- Expo, [StoreReview](https://docs.expo.dev/versions/latest/sdk/storereview/)
