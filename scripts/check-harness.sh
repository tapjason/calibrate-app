#!/usr/bin/env bash
# Self-check for the agent harness (docs/agent-harness.md). Run from Git Bash:
#
#   bash scripts/check-harness.sh
#
# Agents and skills are well-formed, every agent is named in CLAUDE.md and the harness spec, the
# read-only agents can't write, the profile is filled in, and the files the agents read exist.
# Ends in HARNESS CHECK PASSED or HARNESS CHECK FAILED.
set -u
cd "$(dirname "$0")/.." || exit 1

failed=""
fail() {
	failed="$failed\n  - $1"
}

# The builder agents write code in their layer; every other agent only reads and reports.
builders="core-domain mobile-ui services"

echo "== Agents"
for agent in .claude/agents/*.md; do
	name=$(basename "$agent" .md)
	head -n 1 "$agent" | grep -q '^---$' || fail "$agent: no frontmatter"
	for key in name description tools; do
		head -n 10 "$agent" | grep -q "^$key: " || fail "$agent: no '$key' in the frontmatter"
	done
	head -n 10 "$agent" | grep -q "^name: $name$" || fail "$agent: 'name' doesn't match the file name"
	grep -q "\`$name\`" CLAUDE.md || fail "CLAUDE.md doesn't name the agent $name"
	grep -q "\`$name\`" docs/agent-harness.md || fail "docs/agent-harness.md doesn't name the agent $name"
	case " $builders " in
	*" $name "*) continue ;;
	esac
	head -n 10 "$agent" | grep "^tools: " | grep -qE '\b(Write|Edit|NotebookEdit)\b' && fail "$agent: a read-only agent has a writing tool"
	head -n 10 "$agent" | grep -q "^model: " || fail "$agent: no 'model' in the frontmatter"
	case "$name" in
	# The API checker answers item by item and ends on 'Confidence'.
	platform-api-checker) grep -q "Confidence:" "$agent" || fail "$agent: its format has no 'Confidence'" ;;
	*)
		grep -q "Needs you" "$agent" || fail "$agent: its format has no 'Needs you'"
		grep -q "Not verified" "$agent" || fail "$agent: its format has no 'Not verified'"
		;;
	esac
done
# The blind playtester must stay blind: browser tools only.
if head -n 10 .claude/agents/blind-playtester.md | grep "^tools: " | grep -qE '\b(Read|Grep|Glob|Bash|WebFetch|WebSearch)\b'; then
	fail "blind-playtester can see more than the browser"
fi
# The simulator playtester drives a billed session and nothing else: no builds, workflows, sandboxes,
# submissions, review replies or budgets.
if head -n 10 .claude/agents/sim-playtester.md | grep "^tools: " | grep -qE 'mcp__plugin_expo_expo__(build_|workflow_|sandbox_|usage_budget_create|appstore_reply|appstore_delete|playstore_reply)'; then
	fail "sim-playtester has a tool that builds, submits, replies or spends"
fi

echo "== Skills"
for skill in .claude/skills/*/SKILL.md; do
	for key in name description; do
		head -n 8 "$skill" | grep -q "^$key: " || fail "$skill: no '$key' in the frontmatter"
	done
done
for s in check design step playtest release-gate build device-check live-review new-content; do
	[ -f ".claude/skills/$s/SKILL.md" ] || fail ".claude/skills/$s/SKILL.md is missing"
	grep -q "/$s" docs/agent-harness.md || fail "docs/agent-harness.md doesn't describe /$s"
done

echo "== Hook and settings"
# Expo Simulators writes controller tokens to .env.eas-simulator (docs/tooling-notes.md).
git check-ignore -q .env.eas-simulator || fail ".env.eas-simulator isn't git-ignored"
[ -f .claude/hooks/check-ts-edit.sh ] || fail ".claude/hooks/check-ts-edit.sh is missing"
grep -q "check-ts-edit.sh" .claude/settings.json || fail ".claude/settings.json doesn't register the edit hook"
node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8"))' 2>/dev/null || fail ".claude/settings.json isn't valid JSON"

echo "== Profile"
grep -q "^Status: filled in" docs/app-profile.md || fail "docs/app-profile.md isn't filled in"
for n in $(seq 1 18); do
	grep -q "^## §$n " docs/app-profile.md || fail "docs/app-profile.md has no §$n heading"
done

echo "== Docs the agents read"
for f in CLAUDE.md HANDOFF.md BUILD_PLAN.md COACH_AGENT.md GROWTH_AND_MONETIZATION.md docs/agent-harness.md docs/app-profile.md docs/tooling-notes.md docs/HUMAN_VERIFICATION.md docs/APP_STORE_LISTING.md docs/APP_PRIVACY.md docs/design/DESIGN_SYSTEM.md docs/design/UI_ROADMAP.md docs/design/BUILT_LOG.md docs/design/FUTURE_UI.md; do
	[ -f "$f" ] || fail "$f is missing"
done

echo "== Scripts"
for s in scripts/check.sh scripts/web-serve.sh; do
	[ -f "$s" ] || fail "$s is missing"
	bash -n "$s" || fail "$s has a syntax error"
done
bash -n .claude/hooks/check-ts-edit.sh || fail ".claude/hooks/check-ts-edit.sh has a syntax error"

if [ -n "$failed" ]; then
	printf '\nHARNESS CHECK FAILED:%b\n' "$failed"
	exit 1
fi
printf '\nHARNESS CHECK PASSED\n'
exit 0
