#!/usr/bin/env bash
# The Expo web server the playtest agents drive through the Playwright MCP.
#
#   bash scripts/web-serve.sh start    start `expo start --web` in the background and wait until THIS app answers
#   bash scripts/web-serve.sh status   print "up: <url>" or "down" (exit 0 / 1)
#   bash scripts/web-serve.sh stop     stop the server started here
#
# Port: 8097 by default; override with PORT=<n>. Never 8081: that is the owner's iPhone dev server
# (`npx expo start --dev-client --tunnel`), and taking it would cut the phone off.
# "Up" means the page's <title> is this app's name: another app on the port is reported, not reused.
# Log: .tooling/expo-web.log   PID: .tooling/expo-web.pid
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p .tooling
port="${PORT:-8097}"
app_title="Fairly Sure"
log=.tooling/expo-web.log
pidfile=.tooling/expo-web.pid
url="http://localhost:$port/"

if [ "$port" = "8081" ]; then
	echo "Port 8081 is the iPhone dev server's. Use another port (the default is 8097)."
	exit 1
fi

title_on_port() {
	curl -s --max-time 5 "$url" 2>/dev/null | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -n 1
}
is_up() {
	[ "$(title_on_port)" = "$app_title" ]
}
ours_running() {
	[ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

case "${1:-}" in
start)
	if is_up; then
		echo "up: $url (already running)"
		exit 0
	fi
	other=$(title_on_port)
	if [ -n "$other" ]; then
		echo "port $port is serving another app (\"$other\"). Stop it, or run: PORT=<free port> bash scripts/web-serve.sh start"
		exit 1
	fi
	if [ ! -d node_modules ]; then
		echo "Missing node_modules. Run: npm ci"
		exit 1
	fi
	: >"$log"
	# CI=1 keeps Expo non-interactive (no keyboard menu, no prompts). It also turns off file
	# watching: after an edit, stop and start again.
	CI=1 nohup npx expo start --web --port "$port" >>"$log" 2>&1 &
	echo $! >"$pidfile"
	printf 'starting expo web on port %s (pid %s)' "$port" "$(cat "$pidfile")"
	for _ in $(seq 1 90); do
		sleep 2
		printf '.'
		if is_up; then
			printf '\nup: %s\n' "$url"
			exit 0
		fi
		if ! ours_running; then
			printf '\nthe server exited early; last lines of %s:\n' "$log"
			tail -n 30 "$log"
			exit 1
		fi
	done
	printf '\nnot up after 180 s; last lines of %s:\n' "$log"
	tail -n 30 "$log"
	exit 1
	;;
status)
	if is_up; then
		echo "up: $url"
		exit 0
	fi
	other=$(title_on_port)
	if [ -n "$other" ]; then
		echo "down for this app: port $port is serving \"$other\" (use PORT=<free port>)"
		exit 1
	fi
	if [ -f "$pidfile" ] && ! ours_running; then
		echo "down: the server started here has exited (on this PC that is often Windows ending it when memory runs low; see .tooling/expo-web.log). Start it again with: bash scripts/web-serve.sh start"
		exit 1
	fi
	echo "down (start it with: bash scripts/web-serve.sh start)"
	exit 1
	;;
stop)
	stopped=0
	if [ -f "$pidfile" ]; then
		pid=$(cat "$pidfile")
		case "$(uname -s)" in
		MINGW* | MSYS* | CYGWIN*) taskkill //PID "$pid" //T //F >/dev/null 2>&1 && stopped=1 ;;
		*) kill "$pid" 2>/dev/null && stopped=1 ;;
		esac
		rm -f "$pidfile"
	fi
	# Sweep the port only while it is still serving THIS app, never another server.
	if is_up; then
		case "$(uname -s)" in
		MINGW* | MSYS* | CYGWIN*)
			for p in $(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u); do
				taskkill //PID "$p" //T //F >/dev/null 2>&1 && stopped=1
			done
			;;
		esac
	fi
	if [ "$stopped" -eq 1 ]; then echo "stopped"; else echo "nothing of ours was running on port $port"; fi
	exit 0
	;;
*)
	echo "Usage: [PORT=<n>] bash scripts/web-serve.sh start|status|stop"
	exit 1
	;;
esac
