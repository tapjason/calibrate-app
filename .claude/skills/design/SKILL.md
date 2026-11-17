---
name: design
description: Decide whether and how to build a feature, tuning change, playtest finding or open design decision before any code - runs the design-analyst (then platform-api-checker for any API it raises and policy-auditor for any rule it raises), asks the owner to pick, and records the decision as a D number in UI_ROADMAP §2.
argument-hint: "[D number, playtest finding, or a one-line idea]"
disable-model-invocation: true
---

Prepare the decision for: $ARGUMENTS

1. **Find the brief.** If $ARGUMENTS is a D number, read its row in `docs/design/UI_ROADMAP.md` §2. If it's a playtest finding, read it in the latest `docs/design/research/playtest-*.md`. If it's a parked idea, read `docs/design/FUTURE_UI.md`. Otherwise take the user's words as the brief.
2. **Analyse.** Delegate to `design-analyst` with: the question, the options already named, the evidence (file and section), and anything the user said. Wait for its report.
3. **Check facts and rules.** For its "API questions", delegate to `platform-api-checker` (one task, all questions); for its "Policy questions", to `policy-auditor` (one task). The two may run side by side. Add their answers next to the options they affect. If the option touches the record (profile §5), also ask `record-auditor` what it would take to keep R1–R12 holding.
4. **Ask.** Show the option table and the recommendation (short), then ask the owner to pick with AskUserQuestion: the recommended option first and marked "(Recommended)", plus "don't build it". Don't pick for them.
5. **Record.**
   - The decision as a row in `docs/design/UI_ROADMAP.md` §2, in its style: the next D number, "Decided <date> (owner, <evidence>)", what was decided, and why it needed sign-off. A dropped idea is recorded too ("Not adopted: …").
   - If it changes product behaviour, the matching section of `CLAUDE.md` (it is the spec), and `docs/app-profile.md` if a §5 rule, a §12 bar or a §13 budget changed.
   - If it's to be built, an item in `docs/SHIP_READINESS.md` "Open work".
6. **Stop** after recording. Building is `/step` (or a direct request), not this skill.

Never edit `app/` or `src/` here, and never record a decision the owner didn't make.
