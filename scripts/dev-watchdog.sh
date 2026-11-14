#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NeoBet Dev-Server Watchdog — v20.1 (پایدارساز داشبورد)
#
# دستور کارفرما: «داشبورد نمایش داده نمی‌شود، پایدارش کن»
# ریشه: next-server با RSS ۲GB توسط OOM-killer کشته شد و هیچ نگهبانی آن را
# دوباره بالا نیاورد → داشبورد تا ری‌استارت دستی از کار افتاد.
#
# این نگهبان هر ۶۰ ثانیه:
#   ۱) اگر پورت ۳۰۰۰ پاسخ نمی‌دهد:
#      · اگر پروسه next در حال بوت/کامپایل است → فقط صبر (ضد نمونه تکراری)
#      · اگر هیچ پروسه‌ای نیست → سرور را با setsid+nohup بالا می‌آورد (کاملاً مستقل)
#   ۲) اگر RSS پروسه next-server از سقف (۱۲۰۰MB) گذشت → ری‌استارت پیشگیرانه
#      (قبل از اینکه OOM-killerِ کانتینر همه‌چیز را بکشد)
# اجرا:   bash scripts/dev-watchdog.sh start|stop|status
# توقف:   bash scripts/dev-watchdog.sh stop
# ─────────────────────────────────────────────────────────────────────────────

set -u
PROJECT_DIR="/home/z/my-project"
LOCK_FILE="/tmp/neobet-dev-watchdog.lock"
SERVER_PID_FILE="/tmp/neobet-dev-server.pid"
RSS_LIMIT_KB=1228800   # ۱۲۰۰MB — سقف RSS پیش از ری‌استارت پیشگیرانه
CHECK_INTERVAL=60

log() { echo "[$(date '+%m-%d %H:%M:%S')] $*"; }

http_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "http://localhost:3000/" 2>/dev/null || echo 000)
  [[ "$code" != "000" ]]
}

next_running() {
  pgrep -f "next dev" >/dev/null 2>&1 || pgrep -f "next-server" >/dev/null 2>&1
}

start_server() {
  cd "$PROJECT_DIR" || return 1
  if http_ok; then
    log "server already responding on :3000 — skip start"
    return 0
  fi
  if next_running; then
    log "next process exists but :3000 not ready yet (compiling) — waiting, no duplicate spawn"
    return 0
  fi
  log "starting Next.js dev server (setsid bun run dev)…"
  setsid nohup bun run dev >> "$PROJECT_DIR/dev.log" 2>&1 < /dev/null &
  echo $! > "$SERVER_PID_FILE"
  log "dev server spawned (pid $!) — waiting for first response…"
  for _ in $(seq 1 40); do
    sleep 5
    if http_ok; then
      log "dev server is UP on :3000 ✅"
      return 0
    fi
  done
  log "dev server did not answer within 200s ⚠️"
  return 1
}

biggest_next_rss() {
  ps -eo pid,rss,args 2>/dev/null | awk '
    /next-server|next dev|next-router-worker/ && !/awk/ { if ($2+0 > max) { max = $2+0; pid = $1 } }
    END { if (pid != "") print pid" "max; else print "" }'
}

recycle_for_memory() {
  STATS=$(biggest_next_rss)
  if [ -n "$STATS" ]; then
    PID=$(echo "$STATS" | cut -d' ' -f1)
    RSS=$(echo "$STATS" | cut -d' ' -f2)
    if [ "${RSS:-0}" -gt "$RSS_LIMIT_KB" ]; then
      log "⚠️ next-server (pid $PID) RSS=$((RSS / 1024))MB > $((RSS_LIMIT_KB / 1024))MB — proactive recycle before OOM-kill"
      kill "$PID" 2>/dev/null
      sleep 6
      start_server
    fi
  fi
}

case "${1:-start}" in
  stop)
    if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
      kill "$(cat "$LOCK_FILE")" 2>/dev/null && echo "watchdog stopped (pid $(cat "$LOCK_FILE"))"
    else
      echo "watchdog not running"
    fi
    rm -f "$LOCK_FILE"
    exit 0
    ;;
  status)
    if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
      echo "watchdog running (pid $(cat "$LOCK_FILE"))"
    else
      echo "watchdog NOT running"
    fi
    http_ok && echo "server :3000 = UP" || echo "server :3000 = DOWN"
    biggest_next_rss | awk -v L=$((RSS_LIMIT_KB / 1024)) 'NF { printf "next-server pid=%s rss=%dMB (limit %dMB)\n", $1, $2/1024, L }'
    exit 0
    ;;
esac

# فقط یک نمونه نگهبان
if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
  echo "watchdog already running (pid $(cat "$LOCK_FILE"))"
  exit 0
fi
echo $$ > "$LOCK_FILE"

log "watchdog v20.1 started (pid $$) — interval ${CHECK_INTERVAL}s, RSS limit $((RSS_LIMIT_KB / 1024))MB"
while true; do
  if http_ok; then
    recycle_for_memory
  else
    log "❌ :3000 not responding — checking dev server state…"
    start_server
  fi
  sleep "$CHECK_INTERVAL"
done
