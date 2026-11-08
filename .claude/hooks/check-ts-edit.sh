#!/usr/bin/env bash
# PostToolUse hook (Edit|Write). When Claude edits a TypeScript file under app/, src/ or
# supabase/, type-check the project incrementally (bash scripts/check.sh --quick, about 5-10 s).
# Problems go back to Claude on stderr with exit code 2; otherwise exit 0.
# Tests are not run here; /check runs everything. The repo has no Prettier or ESLint config,
# so nothing is reformatted.

input=$(cat)

# The hook input is JSON with "file_path":"...". Windows paths arrive with escaped backslashes.
path=$(printf '%s' "$input" | grep -o '"file_path":"[^"]*"' | head -n 1 | sed 's/^"file_path":"//; s/"$//; s#\\\\#/#g; s#\\#/#g')
[ -n "$path" ] || exit 0

case "$path" in
*.ts | *.tsx) ;;
*) exit 0 ;;
esac
case "$path" in
*/app/* | */src/* | */supabase/*) ;;
*) exit 0 ;;
esac
case "$path" in
*/node_modules/* | */.claude/skills/*) exit 0 ;;
esac

cd "$(dirname "$0")/../.." || exit 0

output=$(bash scripts/check.sh --quick 2>&1)
if [ $? -ne 0 ]; then
	{
		echo "The type check after your last edit found problems. Fix them before continuing:"
		printf '%s\n' "$output" | tail -n 60
	} >&2
	exit 2
fi
exit 0
