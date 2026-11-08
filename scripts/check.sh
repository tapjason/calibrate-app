#!/usr/bin/env bash
# The repo's one check (HANDOFF.md, "Checks"). Stops at the first failure.
# Prints CHECK PASSED only when every step passes.
#
#   bash scripts/check.sh            types, then every test
#   bash scripts/check.sh --quick    incremental types only (the edit hook, .claude/hooks/check-ts-edit.sh)
#   bash scripts/check.sh --release  the full check, then app config, expo-doctor, dependency drift
#                                    and the iOS export to .tooling/export (sizes for the release-auditor)

set -euo pipefail

cd "$(dirname "$0")/.."

mode="${1:-full}"
case "$mode" in
full | --quick | --release) ;;
*)
	echo "Usage: bash scripts/check.sh [--quick | --release]"
	exit 2
	;;
esac

if [ ! -d node_modules ]; then
	echo "Missing node_modules. Run: npm ci"
	exit 1
fi
mkdir -p .tooling

if [ "$mode" = "--quick" ]; then
	echo "== Types (tsc --noEmit, incremental)"
	npx tsc --noEmit --incremental --tsBuildInfoFile .tooling/tsbuildinfo
	echo "CHECK PASSED"
	exit 0
fi

echo "== Types (tsc --noEmit)"
npx tsc --noEmit

echo "== Tests (jest --ci)"
npx jest --ci

if [ "$mode" = "--release" ]; then
	# EXPO_NO_DOTENV=1: these steps never need .env.local, and it keeps its values out of the
	# config file and the exported bundle (and its "env: load" lines out of the JSON).
	export EXPO_NO_DOTENV=1

	echo "== App config (expo config --type public)"
	npx expo config --type public --json >.tooling/app-config.json
	echo "app.json and its plugins resolve (.tooling/app-config.json)."

	echo "== Doctor (expo-doctor)"
	npx expo-doctor

	echo "== Dependency versions (expo install --check)"
	npx expo install --check

	echo "== Export (iOS bundle to .tooling/export)"
	rm -rf .tooling/export
	if ! npx expo export --platform ios --output-dir .tooling/export >.tooling/export.log 2>&1; then
		tail -n 30 .tooling/export.log
		echo "Export failed; full log in .tooling/export.log"
		exit 1
	fi
	node -e '
const fs = require("fs"), path = require("path");
const walk = (d) => fs.readdirSync(d).flatMap((n) => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(".tooling/export");
const total = files.reduce((t, f) => t + fs.statSync(f).size, 0);
const js = files.filter((f) => f.endsWith(".hbc") || f.endsWith(".js")).map((f) => [f, fs.statSync(f).size]).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log("export total:", (total / 1048576).toFixed(2), "MB in", files.length, "files");
for (const [f, s] of js) console.log("  bundle:", path.relative(".tooling/export", f), (s / 1048576).toFixed(2), "MB");
'
fi

echo "CHECK PASSED"
