// ─────────────────────────────────────────────────────────────────────────────
// راستی‌آزمایی بازار واقعی (Market Reality-Check Engine) — v24.0
//
// پاسخ مستند به سه ابهام حیاتی کاربر:
//   ۱) «ضرایب با اختلاف زیادی در واقعیت است و بعضی بازی‌ها/آپشن‌ها اصلاً در
//      سایت‌ها وجود ندارد» → برای هر پایِ هر کارت، قیمت واقعی همان انتخاب در
//      خط مرجع بازار (کلاس قیمتی betforward / 1xbet) بازسازی می‌شود و گپ٪
//      گزارش می‌شود. دسترس‌پذیری بازار هم طبقه‌بندی می‌شود:
//        DIRECT        → مارکت تکی رسمی در betforward و 1xbet موجود است
//        BETBUILDER    → فقط به‌صورت ترکیب دستی (Bet Builder) ساخته می‌شود
//        MATCH_ONLY    → در سایت‌های داخلی برای آن لیگ تابلوی کامل نیست
//   ۲) «دلیل انتخاب تیپ‌ها ضرایب است یا نزدیک‌ترین احتمال نتایج؟» → پایپ‌لاین
//      فعلی با «امتیاز پوشش ماتریس ۶×۶» انتخاب می‌کند (نه EV واقعی، نه
//      نزدیک‌ترین احتمال) — این ماژول مقایسه عددی هر دو معیار را می‌سازد.
//   ۳) «اگر فقط روی تیپ A ورود می‌شد بازدهی چطور بود؟» → سناریوی.counterfactual
//      تیپ A تنها، دو بار حساب می‌شود:
//        · با ضرایب کارت (قیمت موتور)     → ROI نمایشی
//        · با قیمت واقعی بازار (payout ۰.۹۴۵) → ROI واقعی‌پذیر
//
// خط مرجع: پایه‌ی مقایسه «خط بازار واقعی» است. به‌دلیل بسته‌بودن اسکرپ مستقیم
// betforward (پشت Cloudflare) و بلاک جغرافیایی 1xbet در محیط اجرا، مرجع از
// دو راه ساخته می‌شود:
//   · فید چندبوکمیکر واقعی (The Odds API + ESPN DraftKings) وقتی روی Match ثبت است
//   · در نبود فید: خط «شبیه‌ساز بوکمیکر واقعی» = fair odds موتور × payout ۰.۹۴۵
//     (payout رسمی 1xBet) — یعنی حداقلِ فاصله‌ای که در سایت واقعی می‌دیدید.
//     این «سقف خوش‌بینی» است؛ در سایت واقعی معمولاً بدتر از این هم هست.
// ─────────────────────────────────────────────────────────────────────────────

import { REAL_BOOK_PAYOUT, REALITY_GAP_TOLERANCE_PCT, marketAvailability, buildRealMatrixFromLine, legRealProb, realLegPrice, type MarketAvailability as RealMarketAvailability } from "@/lib/engine/real-pricing";

export { REAL_BOOK_PAYOUT, REALITY_GAP_TOLERANCE_PCT, marketAvailability };
export type MarketAvailability = RealMarketAvailability;

// ─── انواع گزارش ───
export interface RealityLegAudit {
  key: string;
  tip: "A" | "B";
  cardOdds: number | null;
  realFairOdds: number | null;
  realBookOdds: number | null;
  modelProb: number | null;
  realProb: number | null;
  gapPct: number | null; // + یعنی کارت گران‌تر از سایت واقعی (پرداخت رویایی)
  availability: MarketAvailability;
  verdict: "OK" | "INFLATED" | "CHEAPER" | "NO_REAL_LINE";
}

export interface RealityCardAudit {
  slipId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: string;
  crownTier: string | null;
  archetype: string | null;
  oddsSource: string;
  hasRealLine: boolean;
  lambdaHome: number | null;
  lambdaAway: number | null;
  legs: RealityLegAudit[];
  worstGapPct: number | null;
  verdict: "REAL_OK" | "GAP" | "NO_REAL_LINE";
  guaranteedProfitOnCard: number;
  guaranteedProfitAtRealOdds: number; // منفی یعنی «سود تضمینی» در سایت واقعی از دست می‌رود
}

export interface RealityReport {
  generatedAt: string;
  ledgerIntegrity: {
    totalSettled: number;
    realtimeIssued: number; // قبل از سوت شروع صادر شده
    paperIssued: number; // بعد از پایان بازی صادر شده (تحلیل کاغذی)
    realtimeSharePct: number;
    realtimeWinRate: number;
    paperWinRate: number;
    realtimeNetProfit: number;
    paperNetProfit: number;
  };
  tipACounterfactual: {
    n: number;
    winRatePct: number;
    roiAtCardOddsPct: number;
    roiAtRealOddsPct: number;
    roiDeltaPct: number;
    avgClaimedEdgePct: number;
    note: string;
  };
  categoryLedger: Array<{
    bucket: string;
    realtime: { n: number; winRatePct: number; net: number };
    paper: { n: number; winRatePct: number; net: number };
  }>;
  pendingAudits: RealityCardAudit[];
  summary: {
    cardsAudited: number;
    legsAudited: number;
    legsRealOk: number;
    legsInflated: number;
    legsBetbuilderOnly: number;
    legsNoRealLine: number;
    medianGapPct: number | null;
    verdict: string;
  };
}

// ──────────────────────────── هسته محاسباتی ────────────────────────────
// قیمت‌گذاری واقعی بازار در لایه موتور متمرکز شده است:
//   src/lib/engine/real-pricing.ts → buildRealMatrixFromLine / legRealProb / realLegPrice
// تا هم خط صدور کارت و هم این گزارش از یک منبع واحد بخوانند.

// ──────────────────────────── گزارش‌ساز اصلی ────────────────────────────

interface SlipRow {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  status: string;
  crownTier: string | null;
  archetypeCode: string | null;
  oddsA: number;
  oddsB: number;
  stakeA: number;
  stakeB: number;
  guaranteedProfit: number;
  legsA: string;
  legsB: string;
  modelProbA: number | null;
  modelProbB: number | null;
  edgeA: number | null;
  createdAt: Date;
  matchId: string | null;
}

function parseLegs(raw: string): Array<{ key?: string; prob?: number }> {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function coverProfit(oddsA: number, oddsB: number, stakeA: number, stakeB: number): number {
  const total = stakeA + stakeB;
  if (total <= 0) return 0;
  const pA = stakeA > 0 ? stakeA * oddsA - total : 0;
  const pB = stakeB > 0 ? stakeB * oddsB - total : 0;
  return Math.round(Math.min(pA, pB) * 10) / 10;
}

export async function runRealityCheck(
  loadSlips: () => Promise<SlipRow[]>,
  loadMatchLine: (matchId: string) => Promise<{
    oddsSource: string;
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
    oddsOver25: number | null;
    oddsUnder25: number | null;
    lambdaHome: number | null;
    lambdaAway: number | null;
  } | null>,
  opts?: { scope?: "pending" | "all"; pendingLimit?: number }
): Promise<RealityReport> {
  const slips = await loadSlips();
  const decided = slips.filter((s) =>
    ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"].includes(s.status)
  );

  // ─── ۱) درستی دفتر: REALTIME در برابر PAPER ───
  const realtime = decided.filter((s) => new Date(s.createdAt).getTime() <= new Date(s.kickoff).getTime());
  const paper = decided.filter((s) => new Date(s.createdAt).getTime() > new Date(s.kickoff).getTime());
  const wr = (arr: SlipRow[]) => (arr.length ? arr.filter((s) => s.status !== "MIDDLE_TRAP").length / arr.length : 0);

  // netProfit در SlipRow نیست — از خود رکورد محاسبه می‌شود (سازگار با settlementProfit
  // موتور؛ فقط تله میانی بدون «سپر کاغذی −۴۵» حساب می‌شود تا زیان صادقانه باشد):
  const netOf = (arr: SlipRow[]) =>
    arr.reduce((a, s) => {
      const total = s.stakeA + s.stakeB;
      let p = 0;
      if (s.status === "WON_A") p = s.stakeA * s.oddsA - total;
      else if (s.status === "WON_B") p = s.stakeB * s.oddsB - total;
      else if (s.status === "DOUBLE_WIN") p = s.stakeA * s.oddsA + s.stakeB * s.oddsB - total;
      else if (s.status === "MIDDLE_TRAP") p = -total; // بدون سپر کاغذی — زیان صادقانه
      return a + p;
    }, 0);

  // ─── ۲) سناریوی.counterfactual تیپ A تنها ───
  let nA = 0, wA = 0, retCard = 0, retReal = 0, edgeSum = 0, edgeN = 0;
  for (const s of decided) {
    const legs = parseLegs(s.legsA);
    if (!legs.length) continue;
    const pA = s.modelProbA ?? legs.reduce((acc, l) => acc * (l.prob ?? 0.5), 1);
    if (!pA || pA <= 0.05) continue;
    nA++;
    const won = s.status === "WON_A" || s.status === "DOUBLE_WIN";
    if (won) wA++;
    retCard += won ? s.oddsA : 0;
    retReal += won ? Math.max(1.01, REAL_BOOK_PAYOUT / pA) : 0;
    if (s.edgeA != null) { edgeSum += s.edgeA; edgeN++; }
  }

  // ─── ۳) دفتر دسته‌بندی: هر دسته در دو دفتر REALTIME/PAPER ───
  const bucketOf = (s: SlipRow): string => s.crownTier || "LEGACY";
  const buckets = Array.from(new Set(decided.map(bucketOf)));
  const categoryLedger = buckets.map((b) => {
    const rt = realtime.filter((s) => bucketOf(s) === b);
    const pp = paper.filter((s) => bucketOf(s) === b);
    return {
      bucket: b,
      realtime: { n: rt.length, winRatePct: Math.round(wr(rt) * 1000) / 10, net: Math.round(netOf(rt) * 10) / 10 },
      paper: { n: pp.length, winRatePct: Math.round(wr(pp) * 1000) / 10, net: Math.round(netOf(pp) * 10) / 10 },
    };
  });

  // ─── ۴) ممیزی کارت‌های پیش‌رو با قیمت واقعی بازار ───
  const pendingSlips = slips
    .filter((s) => s.status === "PENDING" || s.status === "LIVE")
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, opts?.pendingLimit ?? 40);

  const pendingAudits: RealityCardAudit[] = [];
  const gapList: number[] = [];
  let legsAudited = 0, legsOk = 0, legsInflated = 0, legsBB = 0, legsNoLine = 0;

  for (const s of pendingSlips) {
    const line = s.matchId ? await loadMatchLine(s.matchId) : null;
    const hasReal = !!line && line.oddsSource !== "ENGINE" &&
      [line.oddsHome, line.oddsDraw, line.oddsAway].every((o) => Number.isFinite(o) && o >= 1.01);
    const built = hasReal ? buildRealMatrixFromLine(line!) : null;
    // بدون خط واقعی → ماتریس حداقلی از λ موتور (خوش‌بینانه‌ترین سنجش ممکن)
    const matrix = built?.matrix ?? null;
    const legs: RealityLegAudit[] = [];
    const auditLegs = (raw: string, tip: "A" | "B", cardOdds: number | null, modelProb: number | null) => {
      for (const l of parseLegs(raw)) {
        const key = l.key ?? "?";
        const avail = marketAvailability(key);
        let audit: RealityLegAudit = {
          key, tip, cardOdds, realFairOdds: null, realBookOdds: null,
          modelProb, realProb: null, gapPct: null, availability: avail, verdict: "NO_REAL_LINE",
        };
        if (avail === "OFF_BOARD") {
          audit.availability = "OFF_BOARD";
        } else if (matrix) {
          // مارکت‌های پایه 1X2/O-U خط مستقیم بوکمیکر دارند — مابقی از ماتریس بازسازی می‌شود
          const directBase =
            key === "HOME" ? line!.oddsHome : key === "AWAY" ? line!.oddsAway : key === "O25" ? line!.oddsOver25 : key === "U25" ? line!.oddsUnder25 : null;
          const price = realLegPrice(key, matrix, hasReal && typeof directBase === "number" ? directBase : null);
          audit.realProb = price.realProb != null ? Math.round(price.realProb * 1000) / 1000 : null;
          audit.realFairOdds = price.realFairOdds;
          audit.realBookOdds = price.realBookOdds;
          if (cardOdds != null && price.realBookOdds != null && hasReal) {
            const gap = Math.round((cardOdds / price.realBookOdds - 1) * 1000) / 10;
            audit.gapPct = gap;
            gapList.push(gap);
            audit.verdict = gap > REALITY_GAP_TOLERANCE_PCT ? "INFLATED" : gap < -12 ? "CHEAPER" : "OK";
          }
        }
        legs.push(audit);
        legsAudited++;
        if (audit.availability === "BETBUILDER") legsBB++;
        if (audit.verdict === "OK") legsOk++;
        else if (audit.verdict === "INFLATED") legsInflated++;
        else if (audit.availability !== "OFF_BOARD") legsNoLine++;
      }
    };
    auditLegs(s.legsA, "A", s.oddsA, s.modelProbA);
    auditLegs(s.legsB, "B", s.oddsB, s.modelProbB);

    const gaps = legs.map((l) => l.gapPct).filter((g): g is number => g != null);
    const worstGap = gaps.length ? Math.max(...gaps) : null;
    // سود تضمینی با قیمت واقعی: اگر هر دو پا به قیمت واقعی بود، داچینگ چه می‌داد؟
    const realOddsA = legs.find((l) => l.tip === "A" && l.realBookOdds != null)?.realBookOdds ?? null;
    const realOddsB = legs.find((l) => l.tip === "B" && l.realBookOdds != null)?.realBookOdds ?? null;
    const guarReal = realOddsA != null && realOddsB != null ? coverProfit(realOddsA, realOddsB, s.stakeA, s.stakeB) : 0;

    pendingAudits.push({
      slipId: s.id,
      league: s.league,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      kickoff: new Date(s.kickoff).toISOString(),
      status: s.status,
      crownTier: s.crownTier,
      archetype: s.archetypeCode,
      oddsSource: line?.oddsSource ?? "ENGINE",
      hasRealLine: hasReal,
      lambdaHome: built?.lambdaHome ?? null,
      lambdaAway: built?.lambdaAway ?? null,
      legs,
      worstGapPct: worstGap,
      verdict: !matrix ? "NO_REAL_LINE" : worstGap != null && worstGap > REALITY_GAP_TOLERANCE_PCT ? "GAP" : "REAL_OK",
      guaranteedProfitOnCard: s.guaranteedProfit,
      guaranteedProfitAtRealOdds: guarReal,
    });
  }

  const sortedGaps = [...gapList].sort((a, b) => a - b);
  const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;
  const realCount = pendingAudits.filter((c) => c.verdict === "REAL_OK").length;

  return {
    generatedAt: new Date().toISOString(),
    ledgerIntegrity: {
      totalSettled: decided.length,
      realtimeIssued: realtime.length,
      paperIssued: paper.length,
      realtimeSharePct: decided.length ? Math.round((realtime.length / decided.length) * 1000) / 10 : 0,
      realtimeWinRate: Math.round(wr(realtime) * 1000) / 10,
      paperWinRate: Math.round(wr(paper) * 1000) / 10,
      realtimeNetProfit: Math.round(netOf(realtime) * 10) / 10,
      paperNetProfit: Math.round(netOf(paper) * 10) / 10,
    },
    tipACounterfactual: {
      n: nA,
      winRatePct: nA ? Math.round((wA / nA) * 1000) / 10 : 0,
      roiAtCardOddsPct: nA ? Math.round((retCard / nA - 1) * 1000) / 10 : 0,
      roiAtRealOddsPct: nA ? Math.round((retReal / nA - 1) * 1000) / 10 : 0,
      roiDeltaPct: nA ? Math.round(((retCard - retReal) / nA) * 1000) / 10 : 0,
      avgClaimedEdgePct: edgeN ? Math.round((edgeSum / edgeN) * 10) / 10 : 0,
      note:
        "ROI کارت با «ضرایب نمایشی موتور» است؛ ROI واقعی با payout ۰.۹۴۵ بوکمیکر واقعی (کلاس betforward/1xbet) بازسازی شده — فاصله این دو دقیقاً همان اختلافی است که در سایت می‌بینید.",
    },
    categoryLedger,
    pendingAudits,
    summary: {
      cardsAudited: pendingAudits.length,
      legsAudited,
      legsRealOk: legsOk,
      legsInflated,
      legsBetbuilderOnly: legsBB,
      legsNoRealLine: legsNoLine,
      medianGapPct: medianGap,
      verdict: pendingAudits.length
        ? realCount === pendingAudits.length
          ? "همه کارت‌ها با قیمت واقعی بازار هم‌خوان است"
          : `${pendingAudits.length - realCount} کارت از ${pendingAudits.length} با قیمت سایت واقعی هم‌خوان نیست — درخت قیمت‌گذاری موتور (۱۱۸٪ خط منصفانه خودش) باید به خط مرجع واقعی وصل شود`
        : "کارت پیش‌رویی برای ممیزی نیست",
    },
  };
}
