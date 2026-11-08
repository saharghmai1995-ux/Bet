// ─────────────────────────────────────────────────────────────────────────────
// حلقه فعال درس‌های کالیبراسیون (Active Calibration Lesson Feedback Loop) — v9.0
//
// پس از تسویه خودکار بازی‌های تمام‌شده در هر لیگ، ۳ شاخص خطا محاسبه می‌شود:
//   ۱) انحراف گلزنی لیگ (Goal Bias): میانگین گل واقعی در برابر λ پیش‌بینی
//   ۲) نرخ موفقیت هر یک از ۵ الگوی متعامد (Archetype Hit Rate)
//   ۳) سود/زیان خالص هر الگو → بردار قانون عددی (Active Rule Vector)
//
// خروجی مستقیماً در دو مغز سیستم تزریق می‌شود:
//   · موتور احتمالات → lambdaMultiplier (کاهش/افزایش امید گل پایه)
//   · ایجنت سوپروایزر → archetypeBoosts (تغییر UtilityScore الگوها)
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import {
  deriveActiveLeagueRule,
  archetypeCodeOf,
  type ActiveLeagueRule,
  type RuleSettledSlip,
} from "@/lib/engine/calibration";

const RULES_TTL_MS = 5 * 60_000; // کش ۵ دقیقه‌ای — پس از هر تسویه تازه‌سازی می‌شود

interface RulesCache {
  rules: Map<string, ActiveLeagueRule>;
  fetchedAt: number;
  inFlight: Promise<Map<string, ActiveLeagueRule>> | null;
}

const cache: RulesCache = { rules: new Map(), fetchedAt: 0, inFlight: null };

/** خوانش کارت‌های تسویه‌شده ۳۰ روز اخیر و استخراج بردار قانون هر لیگ */
async function loadRules(): Promise<Map<string, ActiveLeagueRule>> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const settled = await db.issuedSlip.findMany({
    where: {
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { gte: since },
    },
    select: {
      league: true,
      archetype: true,
      lambdaHome: true,
      lambdaAway: true,
      homeGoals: true,
      awayGoals: true,
      netProfit: true,
    },
    orderBy: { settledAt: "desc" },
    take: 300,
  });

  const byLeague = new Map<string, RuleSettledSlip[]>();
  for (const s of settled) {
    if (s.homeGoals === null || s.awayGoals === null) continue;
    const arr = byLeague.get(s.league) ?? [];
    arr.push({
      league: s.league,
      archetypeCode: archetypeCodeOf(s.archetype),
      lambdaHome: s.lambdaHome,
      lambdaAway: s.lambdaAway,
      homeGoals: s.homeGoals,
      awayGoals: s.awayGoals,
      netProfit: s.netProfit,
    });
    byLeague.set(s.league, arr);
  }

  const out = new Map<string, ActiveLeagueRule>();
  for (const [league, slips] of byLeague) {
    const rule = deriveActiveLeagueRule(league, slips);
    if (rule) out.set(league, rule);
  }
  return out;
}

/** بردار قانون فعال (کش ۵ دقیقه‌ای) — کلید = نام لیگ */
export async function getActiveRules(): Promise<Map<string, ActiveLeagueRule>> {
  if (cache.rules.size >= 0 && Date.now() - cache.fetchedAt < RULES_TTL_MS) return cache.rules;
  if (cache.inFlight) return cache.inFlight;
  cache.inFlight = loadRules()
    .then((rules) => {
      cache.rules = rules;
      cache.fetchedAt = Date.now();
      return rules;
    })
    .finally(() => {
      cache.inFlight = null;
    });
  return cache.inFlight;
}

/** قانون فعال یک لیگ (یا null) */
export async function getActiveRuleFor(league: string): Promise<ActiveLeagueRule | null> {
  try {
    const rules = await getActiveRules();
    return rules.get(league) ?? null;
  } catch {
    return null;
  }
}

/** تازه‌سازی اجباری (پس از تسویه جدید) */
export async function invalidateRulesCache(): Promise<void> {
  cache.fetchedAt = 0;
  try {
    await getActiveRules();
  } catch {
    // خطا بی‌صدا — کش خالی معتبر است
  }
}

export type { ActiveLeagueRule };
