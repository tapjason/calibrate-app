---
name: step
description: Build one roadmap step (an open item in docs/SHIP_READINESS.md "Open work", or a fix batch from a playtest or a device run) on its own builder branch, through the project's loop - verify APIs, implement through a builder subagent (Opus or Sonnet, weighed per task), check, record, commit, rewrite HANDOFF.md, and list what the owner must check on the iPhone. No review unless the owner asks for one.
argument-hint: "[step number, D number, or topic]"
disable-model-invocation: true
---

Build step $ARGUMENTS.

## Before starting

1. Read `HANDOFF.md`, `CLAUDE.md` and `docs/app-profile.md`, then the item in `docs/SHIP_READINESS.md` "Open work" (what's built is in `docs/design/BUILT_LOG.md`) and its decision row (D number) in `docs/design/UI_ROADMAP.md` §2. For UI, read `docs/design/DESIGN_SYSTEM.md` (§0, §8 and the §7 pattern); for the engine, the `CLAUDE.md` Calibration Engine. How the agents fit together is in `docs/agent-harness.md`.
2. Run `git status` and `git branch --show-current`. If there are uncommitted changes you didn't make in this session, stop and ask what to do with them.
3. Create the branch `builder/<topic>` from the current branch (say which one it starts from; nothing is pushed).
4. If the step's decision isn't recorded as decided, stop: it's `/design` first.

## The loop

1. **Verify before relying.** If the step uses an Expo, React Native, Supabase, RevenueCat or Apple API, config option, entitlement or limit the repo doesn't already use, delegate to `platform-api-checker` first and build on its answer. Say whether it needs a new development build.
2. **Implement** in small steps on disk, in the layers (profile §4): types → db → engine → stores → services → screens. All code and tests, however small, go to a builder subagent: the layer's builder agent (`core-domain`, `services`, `mobile-ui`) for work inside one layer, otherwise a general-purpose agent. Weigh the model for each brief by `CLAUDE.md`'s "Who does what": `model: "opus"` with `effort: "xhigh"` where a mistake could be silent or costly (the record, sync and migrations, sign-in and privacy, billing, the Coach's validator), for work across layers and for a bug with no pinned cause; `model: "sonnet"` at its usual effort where the brief says exactly what to do and a mistake would show in the check or a screenshot. In doubt, Opus; re-brief on Opus what Sonnet gets wrong. The main session (Fable) writes the brief and judges the result; it doesn't implement directly. Rules go in `src/engine/` with a unit test beside them; tunables in `src/constants/`; a new SQLite change is a new migration; native packages through `npx expo install`.
3. **Check.** `bash scripts/check.sh` until it ends in `CHECK PASSED`. The edit hook type-checks after every edit; the full check runs the tests. Judge the script's own exit code, never its output through a pipe (`| tail` hides a failure).
4. **No review unless the owner asks.** He calls the reviewers himself, after several features at once. When he does: `code-reviewer`; `record-auditor` if the changes touch a score, badge, lean, count, what is scored, copy that explains scoring, a card or recap, or the Coach context (profile §5); `policy-auditor` if they touch sign-in, notifications, data leaving the phone, analytics, the Coach, permissions, the paywall or purchases, age assurance, or store copy. All on Opus at `xhigh`, side by side with each other but never with a browser agent. Fix every blocker, should-fix, broken rule and FAIL (or record why one is wrong; NEEDS HUMAN items go to the owner), check again, and re-run the reviewers on the fixed result, up to three rounds.
5. **Look.** For a visible change: `/playtest` (web) when the flow changed, or at least web screenshots at 320 and 375 wide in both appearances. Then write the iPhone checks (`/device-check`).
6. **Record and commit.**
   - `docs/design/BUILT_LOG.md`: the step's row (what was built, what needs an iPhone check).
   - The decision row: "Built <date> as step <n>".
   - `CLAUDE.md` where it is the spec, if behaviour changed; `docs/SHIP_READINESS.md` "Open work" (mark the item done there).
   - `HANDOFF.md` rewritten for this branch: what this PR did, in progress, next step, open decisions, checks (the suite and test counts), and the step listed as unreviewed until the owner calls a review.
   - Commit only once `bash scripts/check.sh` has exited 0, in the repo's style (`feat:`, `fix:`, `docs:`, `refactor:`), no Co-Authored-By line (the owner's preference). Never push.

## At the end

Report briefly: what was built, the check result, that the step is unreviewed (or the verdicts, if the owner called a review), what the owner must check on the iPhone (exact steps), and what no device has run. Say whether a new development build is needed (a native change) or a reload is enough (JS only); a TestFlight build needs a new build for any change.

## Stop and ask when

- a step needs an owner action (profile §16): EAS credentials or a build, App Store Connect, RevenueCat, Supabase dashboard or live migrations, `git push`, spending money, the iPhone;
- the decision is ambiguous, or the step conflicts with `CLAUDE.md` or the profile;
- the same check fails three times for the same reason;
- a change could lose someone's data, edit a migration that has run on a phone, change an id or the app identity (§8), or weaken a §5 rule.
