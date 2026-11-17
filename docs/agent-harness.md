# Agent harness: subagents from idea to the App Store (solo developer, iPhone app)

How the agents work. The agent files are in `.claude/agents/`, the skills in `.claude/skills/`,
and everything app-specific they read is in `docs/app-profile.md`. Adapted on 2026-11-08 from the
harness in the owner's other projects (`duolingo-bible`, an Expo app, and the Roblox harness kit it
came from), with this app's record rules in place of their content rules and the iPhone in place of
their test bridge.

To change how an agent works, edit its file and this spec together, then run
`bash scripts/check-harness.sh`. To change what it knows about the app (rules, bars, budgets,
personas), edit the profile only. Agents added or edited mid-session load in the next Claude Code
session.

## Principles

- **One question per agent.** Each agent answers one question at one stage, from its own evidence.
  Two agents never judge the same thing, with one exception on purpose (the record, below).
- **Two kinds of agent.** The **builder agents** (`core-domain`, `services`, `mobile-ui`) write code
  and tests in their layer when the main session delegates. Every other agent **reads and
  reports**: it never edits files, never builds, never submits. The main session owns the branch,
  the commits and `HANDOFF.md`; the owner makes the calls marked "your call".
- **Who does what.** All implementation (code and tests, however small) and every review the owner
  calls go to Opus subagents, spawned with `model: "opus"` and `effort: "xhigh"`. Fable, the main
  session, keeps design, delegation, evaluating screenshots and bugs, and designing playtests, and
  never implements directly. Design subagents (`design-analyst`, `Plan`) run on Fable at `medium`
  effort, or `high` when the question touches the record, money, privacy or data loss.
- **Reviews when the owner calls them.** The code-reviewer and the two auditors run when the owner
  asks for a review (he calls one after several features at once), again on the fixed result
  inside that review (up to three rounds), and in release mode at `/release-gate`; never after
  every task.
- **A fixed verdict.** Each reviewing agent returns an exact format ending in "Needs you" and "Not
  verified", so the skills can merge reports.
- **Run on triggers only.** Subagents are the expensive path: each runs at its trigger in the map,
  never once per edit, and not for a lookup the main session can do itself.
- **One browser at a time.** The web-playtester and the blind-playtester share the one Playwright
  session, the one web server and the one browser database; they run one after the other. Agents
  that don't touch the browser may run side by side.
- **The iPhone is the truth.** Web and tests are stand-ins. Every report lists what only the
  owner's iPhone can show (profile §18) under "Not verified", and `/device-check` turns it into the
  owner's checklist.
- **Blind playtests stay blind.** The blind-playtester has only browser tools, the method every
  playtest round since October has used (`docs/design/research/playtest-*.md`). The main session
  writes its brief and checks its findings against the code afterwards.
- **Models:** `sonnet` for fact-checking, driving the browser and measuring; `inherit` for judgment
  (review, the record, policy, design, the blind runs, live ops), set at spawn by "Who does what"
  above.
- **The profile, not the prompt.** Agents read app facts from `docs/app-profile.md` by section.
- **Where things are recorded** (this repo's existing documents, not new ones):
  - decisions: `docs/design/UI_ROADMAP.md` §2 (D numbers), and `CLAUDE.md` where it is the spec;
  - what was built: `docs/design/BUILT_LOG.md` (step numbers);
  - what's open: `docs/SHIP_READINESS.md` "Open work";
  - playtests: `docs/design/research/playtest-<date>.md`;
  - the owner's checks: `docs/HUMAN_VERIFICATION.md`;
  - the branch's state: `HANDOFF.md`, rewritten each PR.

## The map

| Stage | Trigger | Agent | Question | Verdict | Run by |
| --- | --- | --- | --- | --- | --- |
| 1 Decide | Before a feature, a tuning change, a playtest finding that needs the owner, or an open D number | `design-analyst` | Is it worth building, and which option? | Options ranked, a draft decision row, "your call" items | `/design` |
| 1 Decide | Before code relies on an Expo, RN, Supabase, RevenueCat or Apple API, config, entitlement or limit the repo doesn't use yet | `platform-api-checker` | What do the version-matched docs say, and does it need a new build? | Verified / partly verified / not documented | `/design`, `/step` |
| 2 Build | Any code or tests in one layer, however small (on Opus at `xhigh`) | `core-domain`, `services`, `mobile-ui` | (They build, then hand back) | Code and tests | `/step` |
| 2 Build | A review the owner calls of changes to `app/`, `src/`, `supabase/` or config (after several features at once), again after fixes (up to three rounds) | `code-reviewer` | What breaks on a real iPhone? | BLOCKER / should-fix / nit | The owner, `/release-gate` |
| 2 Build | Inside a review the owner calls, a change to anything that computes, shows or explains a score, badge, lean or count, a card or recap, or the Coach context | `record-auditor` | Is the record still honest? | HOLDS / BROKEN / NEEDS HUMAN | The owner, `/design`, `/release-gate` |
| 2 Build | Inside a review the owner calls, a change to sign-in, notifications, data leaving the phone, analytics, the Coach, permissions, the paywall, age assurance or store copy | `policy-auditor` | Does it break an Apple or project rule? | PASS / FAIL / NEEDS HUMAN | The owner, `/design`, `/release-gate` |
| 3 Play | After a flow or UI change; before a release | `web-playtester` | Does it work in the web build? | WORKS / BROKEN / BLOCKED | `/playtest` |
| 3 Play | After a flow, copy, onboarding or share change; whenever a round of judgement is wanted | `blind-playtester` | Would this person keep it? | Verdict, score, ranked complaints | `/playtest` |
| 3 Play | After any change with a native or layout effect; when the owner sends device results | (the owner, on the iPhone) | Does it work on the phone? | Confirmed / failed, recorded | `/device-check` |
| 4 Ship | Before every production build and at every release gate | `release-auditor` | Is it ready to submit? | READY / FLAGS / BLOCKED | `/release-gate`, `/build` |
| 4 Ship | Weekly after launch, on data the owner pastes in | `live-ops-analyst` | What hurts the funnel now? | Issues ranked by the §14 signals | `/live-review` |

`/release-gate` runs the reviewing agents in release mode, the web-playtester and the
release-auditor, checks the iPhone record, then says GO or NO-GO.

## What each agent reads from the profile

| Agent | Profile sections |
| --- | --- |
| `design-analyst` | §2, §5, §6, §7, §10, §12, §18 |
| `platform-api-checker` | §1 (versions); otherwise the code and the docs |
| `code-reviewer` | §3, §4, §5, §8, §13, §18 |
| `record-auditor` | §5, §8 |
| `policy-auditor` | §1, §3, §6, §7, §8, §14, §17 |
| `web-playtester` | §2, §9, §18 |
| `blind-playtester` | none (blind: the brief carries everything) |
| `release-auditor` | §1, §8, §13, §16, §17, §18 |
| `live-ops-analyst` | §1, §5, §12, §14 |
| `core-domain`, `services`, `mobile-ui` | §4, plus §5 (core-domain) and §18 (mobile-ui) |
| `/playtest` | §9, §10, §18 |
| `/device-check` | §18 |
| `/build` | §1, §8, §16, §18 |
| `/release-gate` | §8, §16, §17, §18 |
| `/new-content` | §5, §8, §15 |

## Shared formats

Every reviewing agent ends its report with this block, which the skills merge into one list:

```
Needs you
- [ ] <what to do> — <why> — <where: file, dashboard, App Store Connect, the iPhone> — <by: date or "before submission">
Not verified
- <what this report couldn't check, and why>
```

Severity words:
- **BLOCKER:** it breaks the app, loses data, breaks a §5 record rule, or breaks an Apple rule. Fix it before merge or release.
- **should-fix:** a real defect with a workaround. Fix it this step, or say in the step's notes why not.
- **nit:** optional.
- **your call:** a design or product decision. It goes to the owner and never gets fixed silently.

Evidence labels: every claim says where it came from.
- **measured:** a browser run, a test, a number from `check.sh --release`.
- **device:** the owner's report from the iPhone.
- **docs:** a source URL.
- **estimate:** the agent's judgment, said as such.

## Agents in brief

- **design-analyst** (inherit, purple): restates the problem; 2–4 options including "don't build
  it"; scores each on the §5 record ids, the personas and the rubric; says how it fits iOS; cites
  the research and playtest files; drafts the D-number row; hands API questions to the checker and
  policy questions to the auditor.
- **platform-api-checker** (sonnet, cyan): one block per API from the SDK 55 docs, React Native
  0.83, the package's own release notes, Supabase, RevenueCat and Apple; says whether it needs a
  new development build and what iOS version; "not documented" over a guess.
- **code-reviewer** (inherit, orange): offline-first, local days, transactions and migrations,
  sync, notifications, layering, strict types, iOS on the New Architecture (the §18 traps), tokens
  and accessibility, secrets and Edge Functions, money, privacy. Flags record and policy questions
  to their auditors. Release mode reviews the whole tree plus the §8 NO-GO checks. Up to three
  rounds inside a review the owner calls.
- **record-auditor** (inherit, teal): the engine fixtures, every R id the change touches, each
  changed number traced to the engine, an attempt to pad the record, reconciliation across every
  surface, and copy that claims how scoring works.
- **policy-auditor** (inherit, red): App Review Guidelines (1.1, 2.3, 3.1.1, 3.1.2, 4.5.4, 4.8,
  5.1.1(v), 5.1.2(i)), privacy labels and manifests, the age-rating questionnaire and age
  assurance, plus the money and what-leaves-the-phone rules. Release mode drafts the questionnaire,
  the labels and the review notes.
- **web-playtester** (sonnet, green): the web server through the Playwright MCP: a fresh install
  and the demo data, the §2 flow, iPhone widths in both appearances and at large text, console
  errors from app code, the accessibility tree, DESIGN_SYSTEM §8.
- **blind-playtester** (inherit, yellow): one persona, browser only, as judgemental as is fair;
  the main session synthesises the runs against the docs into a playtest file.
- **release-auditor** (sonnet, blue): `check.sh --release`, doctor and drift, the iOS bundle and
  assets, `app.json` and `eas.json` for iOS (entitlements, usage strings, encryption, ascAppId),
  contrast and labels, the App Store Connect checklist, then the owner's submission and device
  steps in order.
- **live-ops-analyst** (inherit, pink; unused until launch): ranks pasted App Store Connect,
  RevenueCat and Supabase data by the §14 signals and routes each issue.
- **core-domain**, **services**, **mobile-ui** (builders, no model set: they inherit): code in L1–L4,
  L5 and L6, handing back anything outside their layer.

**The record is checked twice on purpose:** the code-reviewer flags any change that can move a
number and rules on obvious breaks; the record-auditor traces it, tries to pad it and reconciles
every surface. A score that can be gamed is the one defect both should catch: every blind playtest
round since 2026-11-01 found one (D35, D41, D45).

## Skills

Each skill is `.claude/skills/<name>/SKILL.md`. `/check`, `/device-check` and `/new-content` can be
invoked by the model; the rest have `disable-model-invocation: true` (the user starts them).

- **`/design <D number | finding | idea>`:** `design-analyst`, then the checker and auditors on
  what it raises; the owner picks (AskUserQuestion); the pick becomes a D-number row in
  UI_ROADMAP §2 and, if it's to be built, an item in SHIP_READINESS "Open work".
- **`/step <n | topic>`:** a `builder/<topic>` branch; verify APIs, implement through an Opus
  builder, check, look, record in BUILT_LOG, the decision row, SHIP_READINESS "Open work" and
  HANDOFF (the step listed as unreviewed), commit once the check exits 0; then the owner's iPhone
  checks. No review unless the owner asks for one.
- **`/playtest`:** the web server, `web-playtester`, then one `blind-playtester` run per persona,
  synthesised and ranked into `docs/design/research/playtest-<date>.md`.
- **`/device-check`:** the owner's iPhone checklist for what changed (reload or rebuild, steps,
  what passes), then recording what they report.
- **`/build <development | production>`:** pre-flight (clean tree, check, drift, EAS login and
  environment names, native changes), then the exact `npx eas build` command, run only after the
  owner confirms; never `eas submit`.
- **`/release-gate`:** release-mode check, the §8 NO-GO checks, the release agents, the iPhone
  record, the owner's steps; GO or NO-GO.
- **`/live-review`:** `live-ops-analyst` on pasted data, routed into decisions and steps.
- **`/check`:** `bash scripts/check.sh` and its result.
- **`/new-content <type> <idea>`:** a §15 content type's design checks, data and tests.
- **`frontend-design`** (vendored from anthropics/skills): process and restraint for UI work;
  `docs/design/DESIGN_SYSTEM.md` is the brief and wins. **`stageshow`** is parked until App Store
  marketing frames.

## Hook and settings

- `.claude/hooks/check-ts-edit.sh` runs after every Edit or Write of a `.ts`/`.tsx` file under
  `app/`, `src/` or `supabase/`: `bash scripts/check.sh --quick` (incremental `tsc`, about 5–10 s).
  A type error comes back to the session as the hook's error. Tests run only in the full check.
- `.claude/settings.json` (shared) allows the read-only commands, the check scripts, the docs
  domains and the Playwright tools; asks before `eas build`, `eas credentials`, `eas env:create`,
  `eas update`, `git push`, `npm install` and Supabase deploys; denies `eas submit`, force pushes,
  `supabase db reset` and `npm publish`. `.claude/settings.local.json` (git-ignored) is the owner's
  own and adds to it; an "ask" or "deny" here still applies over a local "allow".
- The Playwright MCP server is configured in the owner's Claude Code settings (`playwright`,
  `--isolated`), not in the repo.

## Not covered

- **Teams:** CI on push, file ownership, several people's sessions. Branches and PRs exist, but
  pushing and merging are the owner's.
- **Native test automation:** no simulator and no Mac; device checks are the owner's (profile
  §18), and every report says so.
- **Android:** not planned.
