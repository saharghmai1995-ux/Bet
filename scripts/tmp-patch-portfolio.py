python3 - << 'PYEOF'
import re
p = "src/app/api/agent/portfolio/route.ts"
src = open(p, encoding="utf-8").read()

# 1) add import after last existing import line block start
anchor = 'import { NextRequest, NextResponse } from "next/server";'
add = anchor + '\n// v20.1 — کش کوتاه‌مدت داشبورد: هر poll چندثانیه‌ای دیگر ESPN/موتور کامل اجرا نمی‌کند\nimport { pollCacheGet, pollCacheSet, pollCacheKey } from "@/lib/server/poll-cache";'
assert src.count(anchor) >= 1
src = src.replace(anchor, add, 1)

# 2) early cache check after matchId validation
old = '''    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const mcInputCache = new Map<string, unknown>();'''
new = '''    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    // v20.1 — کش ۳۰ثانیه‌ای per-(matchId,secondMatchId,bankroll) — پاسخ تکراری از حافظه
    const portfolioCacheKey = pollCacheKey("portfolio", {
      matchId,
      secondMatchId: body.secondMatchId ?? "",
      bankroll,
    });
    const portfolioCached = pollCacheGet<unknown>(portfolioCacheKey, 30_000);
    if (portfolioCached) return NextResponse.json(portfolioCached as never);

    const mcInputCache = new Map<string, unknown>();'''
assert old in src, "portfolio validation anchor not found"
src = src.replace(old, new, 1)

# 3) cache set before the final success return (line ~593: return NextResponse.json(result);)
finals = list(re.finditer(r"\n    return NextResponse\.json\(result\);", src))
assert len(finals) >= 1, "final result return not found"
last = finals[-1]
src = src[:last.start()] + "\n    pollCacheSet(portfolioCacheKey, result);" + src[last.start():]

open(p, "w", encoding="utf-8").write(src)
print("portfolio route patched")
PYEOF
rm -f scripts/tmp-patch-portfolio.py; rg -n "pollCache|portfolioCacheKey" src/app/api/agent/portfolio/route.ts | head -6
__workspace_agent_exit_code=$?
printf "\n<<workspace_agent_exit_code:1794622003562:%s>>\n" "$__workspace_agent_exit_code"
