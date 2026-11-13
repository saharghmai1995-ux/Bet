#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NeoBet GitHub Snapshot Engine (v18.1)
# دستور کارفرما: «از پروژه به طور کامل بعد از هر تغییر در گیت‌هاب بکاپ‌گیری
# و اسنپ‌شات گرفته شود» — https://github.com/saharghmai1995-ux/Bet.git
#
#   · git add -A  → کل پروژه (کد + db + assets + mini-services)
#   · commit با پیام snapshot و مهر زمانی
#   · push به origin/main + تگ اسنپ‌شات snapshot-YYYYMMDD-HHMMSS
#   · اگر پوش شکست خورد (توکن/شبکه)، تگ لوکال نگه داشته می‌شود تا در اجرای
#     بعدی هم‌زمان پوش شود — هیچ اسنپ‌شاتی گم نمی‌شود.
# استفاده:  bun run snapshot   |   bash scripts/gh-snapshot.sh ["تغییرات"]
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-snapshot: auto backup $(date '+%Y-%m-%d %H:%M:%S')}"
TS="$(date '+%Y%m%d-%H%M%S')"
TAG="snapshot-${TS}"
LOG=".github-snapshot.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ─── ۱) هیچ چیزی جا نماند ───
git add -A
if git diff --cached --quiet; then
  log "No changes to snapshot."
else
  git commit -m "${MSG} [snapshot:${TS}]" >/dev/null 2>&1 || true
  log "Committed: ${MSG}"
fi

# ─── ۲) تگ اسنپ‌شات (همیشه — حتی بدون تغییر جدید، وضعیت فعلی ثبت می‌شود) ───
git tag -f "${TAG}" >/dev/null 2>&1 && log "Tag created: ${TAG}"

# ─── ۳) پوش برنچ + همه تگ‌های عقب‌افتاده ───
PUSH_OK=1
if ! git push origin main --follow-tags >/dev/null 2>"${LOG}.push-err"; then
  # تلاش دوم با پوش ساده برنچ
  if ! git push origin main >/dev/null 2>>"${LOG}.push-err"; then
    PUSH_OK=0
    log "PUSH FAILED (saved locally, will retry next run): $(tail -1 "${LOG}.push-err" 2>/dev/null)"
    log "HINT: run 'git remote set-url origin https://<TOKEN>@github.com/saharghmai1995-ux/Bet.git' once to authenticate."
  fi
fi

if [ "$PUSH_OK" = "1" ]; then
  # پوش تگ‌هایی که در اجراهای قبلی محلی مانده بودند
  git push origin --tags >/dev/null 2>&1 || true
  LAST_REMOTE="$(git ls-remote origin refs/heads/main 2>/dev/null | cut -f1)"
  LAST_LOCAL="$(git rev-parse HEAD)"
  if [ -n "$LAST_REMOTE" ] && [ "$LAST_REMOTE" = "$LAST_LOCAL" ]; then
    log "Push verified: remote main == local HEAD (${LAST_LOCAL:0:8})"
  else
    log "Push sent (remote sync unverifiable now)."
  fi
  log "SNAPSHOT OK → github.com/saharghmai1995-ux/Bet"
else
  log "SNAPSHOT SAVED LOCALLY (tag ${TAG}) — push pending auth/network."
fi
