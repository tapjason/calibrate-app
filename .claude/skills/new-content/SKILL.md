---
name: new-content
description: Add or change data-driven content of one of the types in docs/app-profile.md §15 (practice facts, a card theme, starter ideas, suggested category emoji) following the existing pattern, with its design checks and tests. Use when asked to add, design or tweak content of a listed type.
argument-hint: "[practice-facts|card-theme|starter-idea|category-emoji] [one-line idea]"
---

Add the content described by: $ARGUMENTS

1. **Find the type.** Read `docs/app-profile.md` §15 and pick the block for the type named. If §15 doesn't list it, stop and ask the user to add the type to §15 first (file, who uses it, its test, its design checks).
2. **Read the pattern.** Read the type's file and the code §15 says uses it. Find the two existing entries closest to the idea and follow how they're built.
3. **Design check before writing.** Run each of the type's design checks against the idea and say whether each holds. Always also: the record (profile §5: practice and Warmup content never touches the real record, R9; a card theme keeps over / under / on-the-line meaning); DESIGN_SYSTEM §0 (no new hue without a meaning, contrast on cards ≥ 4.5:1 for text); §8 ids (an existing id never changes). If any check fails, propose a change to the idea instead of building it.
4. **Add the data** with every field the existing entries have. Practice facts carry their reference; a change to the tables changes the Warmup's ten for everyone, so say so.
5. **Run `bash scripts/check.sh`** until it ends in `CHECK PASSED`.
6. **Look.** No review unless the owner asks for one (he calls `code-reviewer` himself, after several features at once). If the web server is up, take one screenshot that shows the new content (a card in the theme; Log's starter ideas; the emoji grid in Categories).
7. Commit as `feat: <type>: <what>` (no Co-Authored-By line).

Never change an existing id, and never put a person's own icon or photo on a card (D40).
