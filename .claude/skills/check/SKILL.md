---
name: check
description: Run the project check (strict types, then every Jest test) and report the result. Use before saying any code task is done, and whenever the user asks whether the code is healthy.
allowed-tools: Bash(bash scripts/check.sh *), Bash(bash scripts/check.sh)
---

Run `bash scripts/check.sh` from the repo root with the Bash tool (Git Bash on Windows). Pass `--release` when the user asks for the release check (adds `expo config`, `expo-doctor`, dependency drift and the iOS export to `.tooling/export`).

- If it ends with `CHECK PASSED`, say so in one line, with the suite and test counts from Jest's summary.
- If it stops with a failure, list each failed step with its first real error (file:line and message). If you were in the middle of a task, fix the root cause and run the check again. Don't weaken a test, loosen a type, or delete a check to make it pass; if a test is genuinely wrong, say why before changing it. Never edit a migration that has run on a phone, and never change a `CLAUDE.md` worked-example fixture, to make a check pass.
- If it reports missing `node_modules`, tell the user to run `npm ci`, and stop.

The check covers code only. It can't see the web build (`/playtest`) or the iPhone (`/device-check`, `docs/app-profile.md` §18).
