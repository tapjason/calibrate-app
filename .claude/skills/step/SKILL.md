---
name: step
description: Build one roadmap step (a numbered step in docs/NEXT_STEPS.md, or a fix batch from a playtest or a device run) on its own builder branch, through the project's loop - verify APIs, implement, check, review, audit, record, commit, rewrite HANDOFF.md, and list what the owner must check on the iPhone.
argument-hint: "[step number, D number, or topic]"
disable-model-invocation: true
---

Build step $ARGUMENTS.

## Before starting

1. Read `HANDOFF.md`, `CLAUDE.md` and `docs/app-profile.md`, then the step in `docs/NEXT_STEPS.md` "Suggested order" and its decision row (D number) in `docs/design/UI_ROADMAP.md` §2. For UI, read `docs/design/DESIGN_SYSTEM.md` (§0, §8 and the §7 pattern); for the engine, the `CLAUDE.md` Calibration Engine. How the agents fit together is in `docs/agent-harness.md`.
2. Run `git status` and `git branch --show-current`. If there are uncommitted changes you didn't make in this session, stop and ask what to do with them.
3. Create the branch `builder/<topic>` from the current branch (say which one it starts from; nothing is pushed).
4. If the step's decision isn't recorded as decided, stop: it's `/design` first.

## The loop

1. **Verify before relying.** If the step uses an Expo, React Native, Supabase, RevenueCat or Apple API, config option, entitlement or limit the repo doesn't already use, delegate to `platform-api-checker` first and build on its answer. Say whether it needs a new development build.
2. **Implement** in small steps on disk, in the layers (profile §4): types → db → engine → stores → services → screens. Delegate a layer's work to its builder agent (`core-domain`, `services`, `mobile-ui`) when it is large and self-contained; otherwise write it yourself. Rules go in `src/engine/` with a unit test beside them; tunables in `src/constants/`; a new SQLite change is a new migration; native packages through `npx expo install`.
3. **Check.** `bash scripts/check.sh` until it ends in `CHECK PASSED`. The edit hook type-checks after every edit; the full check runs the tests.
4. **Review.** Delegate to `code-reviewer` with the step, the files changed and the decision row. Fix every blocker and should-fix (or record in the step's notes why one is wrong), check again, and review again ("round 2: what changed since round 1") if the fixes were more than trivial, up to three rounds.
5. **Audit when relevant** (side by side with each other, never with a browser agent):
   - `record-auditor` if the step touches a score, badge, lean, count, what is scored, copy that explains scoring, a card or recap, or the Coach context (profile §5). Fix every broken rule.
   - `policy-auditor` if it touches sign-in, notifications, data leaving the phone, analytics, the Coach, permissions, the paywall or purchases, age assurance, or store copy. Fix every FAIL; NEEDS HUMAN items go to the owner.
6. **Look.** For a visible change: `/playtest` (web) when the flow changed, or at least web screenshots at 320 and 375 wide in both appearances. Then write the iPhone checks (`/device-check`).
7. **Record and commit.**
   - `docs/design/BUILT_LOG.md`: the step's row (what was built, what needs an iPhone check).
   - The decision row: "Built <date> as step <n>".
   - `CLAUDE.md` where it is the spec, if behaviour changed; `docs/NEXT_STEPS.md` "Suggested order" (mark it done).
   - `HANDOFF.md` rewritten for this branch: what this PR did, in progress, next step, open decisions, checks (the suite and test counts).
   - Commit in the repo's style (`feat:`, `fix:`, `docs:`, `refactor:`), no Co-Authored-By line (the owner's preference). Never push.

## At the end

Report briefly: what was built, the check result, the review and audit verdicts, what the owner must check on the iPhone (exact steps), and what no device has run. Say whether a new development build is needed (a native change) or a reload is enough (JS only).

## Stop and ask when

- a step needs an owner action (profile §16): EAS credentials or a build, App Store Connect, RevenueCat, Supabase dashboard or live migrations, `git push`, spending money, the iPhone;
- the decision is ambiguous, or the step conflicts with `CLAUDE.md` or the profile;
- the same check fails three times for the same reason;
- a change could lose someone's data, edit a migration that has run on a phone, change an id or the app identity (§8), or weaken a §5 rule.
