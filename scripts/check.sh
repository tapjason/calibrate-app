#!/usr/bin/env bash
# The repo's one check (HANDOFF.md, "Checks"). Stops at the first failure.
# Prints CHECK PASSED only when every step passes.
#
#   bash scripts/check.sh            types, then every test
#   bash scripts/check.sh --quick    incremental types only (the edit hook, .claude/hooks/check-ts-edit.sh)
#   bash scripts/check.sh --release  the full check, then app config, expo-doctor, dependency drift,
#                                    the iOS export to .tooling/export (sizes for the release-auditor)
#                                    and that the privacy and support pages load (SKIP_URL_CHECK=1 to skip)

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

	# The pages the app and the store listing link to. Both were 404 for weeks while the app
	# linked to them (release and policy audits, 2026-11-14): App Review rejects a dead privacy
	# or support URL. Last, so the measurements above still print. SKIP_URL_CHECK=1 when offline.
	if [ "${SKIP_URL_CHECK:-0}" != "1" ]; then
		echo "== Public pages (privacy policy, support)"
		urls="$(node -e '
const src = require("fs").readFileSync("src/constants/app.ts", "utf8");
for (const name of ["PRIVACY_POLICY_URL", "SUPPORT_URL"]) {
  const m = new RegExp("export const " + name + "[^=]*=\\s*\x27([^\x27]+)\x27").exec(src);
  if (!m) { console.error("check.sh: " + name + " not found in src/constants/app.ts"); process.exit(1); }
  console.log(m[1]);
}
')"
		dead=0
		for url in $urls; do
			code="$(curl -s -o /dev/null -L -m 20 -w '%{http_code}' "$url" || true)"
			echo "  $code $url"
			if [ "$code" = "000" ]; then echo "  (no response: offline? SKIP_URL_CHECK=1 skips this step)"; fi
			if [ "$code" != "200" ]; then dead=1; fi
		done
		if [ "$dead" = "1" ]; then
			echo "A public page does not load. Turn GitHub Pages on (docs/HUMAN_VERIFICATION.md, Batch E),"
			echo "or re-run with SKIP_URL_CHECK=1 to measure without it."
			exit 1
		fi
	fi
fi

echo "CHECK PASSED"
