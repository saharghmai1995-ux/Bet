// ─────────────────────────────────────────────────────────────────────────────
// دفتر دکترین + ژورنال تسویه (Doctrine Registry & Journal of Record) — v10.0
//
// پاسخ به «آیا سیستم از نتایج کارنامه یاد می‌گیرد؟»: بله — دو لایه یادگیری:
//   ۱) حلقه فعال v9.0 (calibration-rules) → λ موتور و UtilityScore سوپروایزر
//   ۲) v10.0 — ثبت ماندگار (Persistence):
//        · ژورنال: یک ردیف درس‌دار برای هر تسویه (چه برده، چه باخت صادقانه)
//        · دفتر دکترین: قوانین عددی تجمیعی (لیگ / الگو / پنجره زمانی) که
//          مستقیماً از همان منطق deriveActiveLeagueRule مشتق و مهر و تاریخ می‌خورند
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import type { IssuedSlip } from "@prisma/client";
import { deriveActiveLeagueRule, type ActiveLeagueRule } from "@/lib/engine/calibration";
import { TIMING_WINDOWS, type TimingWindowKey } from "@/lib/timing-window";

// ═════════════════════ درس خودکار هر تسویه (Journal Lesson) ═════════════════════

/** تولید درس ساختاریافته از نتیجه واقعی — بدون LLM، قطعی */
export function journalLessonOf(slip: {
  status: string;
  league: string;
  homeGoals: number | null;
  awayGoals: number | null;
  lambdaHome: number | null;
  lambdaAway: number | null;
  archetypeCode: string | null;
  timingWindowA: string | null;
  netProfit: number | null;
}): string {
  const goals =
    slip.homeGoals !== null && slip.awayGoals !== null ? `${slip.homeGoals}-${slip.awayGoals}` : "نامشخص";
  const lam =
    slip.lambdaHome && slip.lambdaAway ? `λ پیش‌بینی ${slip.lambdaHome.toFixed(2)}-${slip.lambdaAway.toFixed(2)}` : "λ ثبت نشده";
  const arch = slip.archetypeCode ? `الگوی ${slip.archetypeCode}` : "الگوی ثبت‌نشده";
  const win = slip.netProfit !== null && slip.netProfit > 0;

  switch (slip.status) {
    case "DOUBLE_WIN":
      return `🏆 برد طلایی همزمان در ${slip.league} — نتیجه ${goals} در خانه‌های مشترک دو تیپ؛ ${arch} ساختار دو-برد معتبری داشت (${lam}). وزن این الگو در این لیگ تقویت می‌شود.`;
    case "WON_A":
    case "WON_B":
      return `🟢 برد ${slip.status === "WON_A" ? "تیپ A" : "تیپ B"} در ${slip.league} — نتیجه ${goals}، ${arch} (${lam}) سود +${(slip.netProfit ?? 0).toFixed(1)} واحد ثبت کرد. توزیع پواسون این لیگ تأیید شد${win ? "" : " (خالص منفی به‌دلیل سمت بازنده داچینگ)"}.`;
    case "MIDDLE_TRAP":
      return `🔴 تله میانی در ${slip.league} — نتیجه ${goals} هر دو تیپ را سوزاند (${lam}). ریسک باخت همزمان کم‌برآورد شده بود؛ سوپروایزر برای ${arch} در این لیگ جریمه ریسک اعمال می‌کند.`;
    case "VOID":
      return `⚪️ کارت ${slip.league} تعلیق شد (به تعویق/لغو) — از آمار یادگیری حذف شد تا دکترین آلوده نشود.`;
    case "MANUAL_REVIEW":
      return `🟡 بازار خارج اسکوربورد در ${slip.league} — تسویه دستی لازم؛ این بازار به متغیر آموزشی تبدیل نمی‌شود.`;
    default:
      return `نتیجه ${goals} — ثبت در ژورنال.`;
  }
}

// ═════════════════════ ثبت ژورنال + بازسازی دکترین ═════════════════════

/**
 * پس از هر تسویه: ردیف ژورنال + بازسازی کامل دفتر دکترین.
 * Idempotent برای ژورنال (هر slip یک ردیف — با slipId dedupe).
 */
export async function recordSettlementLearning(slip: IssuedSlip): Promise<void> {
  try {
    const existing = await db.settlementJournal.findFirst({ where: { slipId: slip.id }, select: { id: true } });
    if (!existing) {
      await db.settlementJournal.create({
        data: {
          slipId: slip.id,
          slipHash: slip.hash,
          league: slip.league,
          matchLabel: `${slip.homeTeam} ${slip.homeGoals ?? "?"}-${slip.awayGoals ?? "?"} ${slip.awayTeam}`,
          status: slip.status,
          homeGoals: slip.homeGoals,
          awayGoals: slip.awayGoals,
          netProfit: slip.netProfit,
          archetypeCode: slip.archetypeCode,
          timingWindow: slip.timingWindowA ?? slip.timingWindowB,
          lambdaHome: slip.lambdaHome,
          lambdaAway: slip.lambdaAway,
          lesson: journalLessonOf(slip),
        },
      });
    }
  } catch (err) {
    console.warn("journal write failed:", err);
  }
  await rebuildDoctrine().catch((err) => console.warn("doctrine rebuild failed:", err));
}

// ═════════════════════ بازسازی دفتر دکترین ═════════════════════

export interface DoctrineSummary {
  id: string;
  kind: string;
  scope: string;
  summary: string;
  multiplier: number;
  sampleSize: number;
  netProfit: number;
  winRate: number;
  active: boolean;
  updatedAt: string;
}

/** متغیرهای مشترک استخراج کارت‌های تسویه‌شده ۳۰ روز اخیر */
async function loadSettledSlips() {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  return db.issuedSlip.findMany({
    where: {
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { gte: since },
    },
    orderBy: { settledAt: "desc" },
    take: 300,
  });
}

const r1 = (v: number) => Math.round(v * 10) / 10;

async function upsertDoctrine(entry: {
  kind: string;
  scope: string;
  summary: string;
  numericRule: string;
  multiplier: number;
  sampleSize: number;
  netProfit: number;
  winRate: number;
}): Promise<void> {
  const existing = await db.doctrineEntry.findFirst({
    where: { kind: entry.kind, scope: entry.scope },
    select: { id: true },
  });
  if (existing) {
    await db.doctrineEntry.update({ where: { id: existing.id }, data: { ...entry, active: true } });
  } else {
    await db.doctrineEntry.create({ data: entry });
  }
}

/**
 * rebuildDoctrine — کل دفتر دکترین را از کارنامه ۳۰ روزه بازسازی می‌کند:
 *   · LEAGUE_LAMBDA: همان بردار قانون v9 (λ × ضریب + بوست الگوها) — ماندگار می‌شود
 *   · ARCHETYPE: عملکرد هر کد الگو روی کل کانال → بوست عددی سوپروایزر
 *   · TIMING_WINDOW: عملکرد هر پنجره زمانی ثبت (کدام پنجره سودآورتر است)
 */
export async function rebuildDoctrine(): Promise<DoctrineSummary[]> {
  const settled = await loadSettledSlips();
  if (settled.length === 0) return [];

  // ─── ۱) قوانین لیگ (همان منطق موتور — ثبت ماندگار) ───
  const byLeague = new Map<string, typeof settled>();
  for (const s of settled) {
    const arr = byLeague.get(s.league) ?? [];
    arr.push(s);
    byLeague.set(s.league, arr);
  }
  for (const [league, slips] of byLeague) {
    const rule: ActiveLeagueRule | null = deriveActiveLeagueRule(
      league,
      slips
        .filter((s) => s.homeGoals !== null && s.awayGoals !== null)
        .map((s) => ({
          league: s.league,
          archetypeCode: s.archetypeCode,
          lambdaHome: s.lambdaHome,
          lambdaAway: s.lambdaAway,
          homeGoals: s.homeGoals as number,
          awayGoals: s.awayGoals as number,
          netProfit: s.netProfit,
        }))
    );
    if (!rule || rule.sample < 3) continue;
    const net = slips.reduce((acc, s) => acc + (s.netProfit ?? 0), 0);
    const wins = slips.filter((s) => (s.netProfit ?? 0) > 0).length;
    await upsertDoctrine({
      kind: "LEAGUE_LAMBDA",
      scope: league,
      summary: rule.rules[0] ?? "قانون فعال لیگ از انحراف گلزنی و وین‌ریت الگوها",
      numericRule: JSON.stringify({ lambdaMultiplier: rule.lambdaMultiplier, archetypeBoosts: rule.archetypeBoosts, goalBiasPct: rule.goalBiasPct }),
      multiplier: rule.lambdaMultiplier,
      sampleSize: rule.sample,
      netProfit: r1(net),
      winRate: Math.round((wins / slips.length) * 1000) / 10,
    });
  }

  // ─── ۲) عملکرد الگوها (کانال‌وسیع) ───
  const byArch = new Map<string, { n: number; wins: number; net: number }>();
  for (const s of settled) {
    if (!s.archetypeCode) continue;
    const cur = byArch.get(s.archetypeCode) ?? { n: 0, wins: 0, net: 0 };
    cur.n += 1;
    cur.net += s.netProfit ?? 0;
    if ((s.netProfit ?? 0) > 0) cur.wins += 1;
    byArch.set(s.archetypeCode, cur);
  }
  for (const [code, st] of byArch) {
    if (st.n < 2) continue;
    const winRate = Math.round((st.wins / st.n) * 1000) / 10;
    const boost = st.net > 0 ? Math.min(12, Math.round(st.net / 2)) : st.net < -10 ? -8 : 0;
    await upsertDoctrine({
      kind: "ARCHETYPE",
      scope: code,
      summary:
        boost > 0
          ? `الگوی ${code} روی کل کانال وین‌ریت ${winRate}٪ و سود +${r1(st.net)} دارد — پاداش +${boost} امتیاز در UtilityScore`
          : boost < 0
            ? `الگوی ${code} روی کل کانال زیان ${r1(st.net)} ثبت کرده — جریمه ${boost} امتیاز در UtilityScore`
            : `الگوی ${code} در باند خنثی — بدون تغییر وزن`,
      numericRule: JSON.stringify({ boost, sample: st.n, net: r1(st.net), winRate }),
      multiplier: boost,
      sampleSize: st.n,
      netProfit: r1(st.net),
      winRate,
    });
  }

  // ─── ۳) عملکرد پنجره‌های زمانی ثبت (v10.0) ───
  const byWin = new Map<string, { n: number; wins: number; net: number }>();
  for (const s of settled) {
    const key = s.timingWindowA ?? s.timingWindowB;
    if (!key) continue;
    const cur = byWin.get(key) ?? { n: 0, wins: 0, net: 0 };
    cur.n += 1;
    cur.net += s.netProfit ?? 0;
    if ((s.netProfit ?? 0) > 0) cur.wins += 1;
    byWin.set(key, cur);
  }
  for (const [key, st] of byWin) {
    const meta = TIMING_WINDOWS[key as TimingWindowKey];
    if (!meta || st.n < 1) continue;
    const winRate = Math.round((st.wins / st.n) * 1000) / 10;
    await upsertDoctrine({
      kind: "TIMING_WINDOW",
      scope: key,
      summary: `پنجره ${meta.nameFa} — ${st.n} کارت تسویه‌شده، وین‌ریت ${winRate}٪، سود خالص ${r1(st.net)} واحد`,
      numericRule: JSON.stringify({ sample: st.n, net: r1(st.net), winRate, window: meta.nameEn }),
      multiplier: 1,
      sampleSize: st.n,
      netProfit: r1(st.net),
      winRate,
    });
  }

  return listDoctrine();
}

/** خوانش دفتر دکترین برای UI */
export async function listDoctrine(): Promise<DoctrineSummary[]> {
  const rows = await db.doctrineEntry.findMany({
    where: { active: true },
    orderBy: [{ kind: "asc" }, { sampleSize: "desc" }],
    take: 60,
  });
  return rows.map((d) => ({
    id: d.id,
    kind: d.kind,
    scope: d.scope,
    summary: d.summary,
    multiplier: d.multiplier,
    sampleSize: d.sampleSize,
    netProfit: d.netProfit,
    winRate: d.winRate,
    active: d.active,
    updatedAt: d.updatedAt.toISOString(),
  }));
}

/** ژورنال اخیر برای UI */
export async function listJournal(take = 30) {
  const rows = await db.settlementJournal.findMany({ orderBy: { createdAt: "desc" }, take });
  return rows.map((j) => ({
    id: j.id,
    league: j.league,
    matchLabel: j.matchLabel,
    status: j.status,
    netProfit: j.netProfit,
    archetypeCode: j.archetypeCode,
    timingWindow: j.timingWindow,
    lesson: j.lesson,
    createdAt: j.createdAt.toISOString(),
  }));
}
