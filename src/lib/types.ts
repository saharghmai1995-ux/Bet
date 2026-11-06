// ═══════════════════════════════════════════════════════
// v4.0 — فید زنده چند-API (Live Multi-API Telemetry)
// ═══════════════════════════════════════════════════════

/** وضعیت سلامت هر منبع داده زنده */
export interface LiveFeedSourceDTO {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

/** تیتر خبر زنده ESPN */
export interface LiveNewsDTO {
  headline: string;
  description: string;
  published: string;
  url: string;
  leagueSlug: string;
}

/** خروجی کامل همگام‌سازی فید زنده */
export interface LiveFeedDTO {
  success: boolean;
  mode: "LIVE" | "FALLBACK";
  lastSyncAt: number;
  matchesLive: number;
  matchesUpcoming: number;
  matchesInPlay: number;
  news: LiveNewsDTO[];
  sources: LiveFeedSourceDTO[];
  odds: {
    used: boolean;
    creditsRemaining: number | null;
    lastOddsSyncAt: number | null;
    throttled: boolean;
  };
  weatherAdjusted: number;
  calibrated: number;
  archived: number;
  elapsedMs: number;
}

// ─────────────────────────────────────────────
// تایپ‌های مشترک فرانت‌اند
// ─────────────────────────────────────────────

export interface MatchDTO {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  homeElo: number;
  awayElo: number;
  homeXg: number;
  awayXg: number;
  homePpda: number;
  awayPpda: number;
  homeFieldTilt: number;
  awayFieldTilt: number;
  homeForm: string;
  awayForm: string;
  weather: string;
  homeAbsence: string | null;
  awayAbsence: string | null;
  homeMotivation: string | null;
  awayMotivation: string | null;
  tacticalNote: string | null;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25: number;
  oddsUnder25: number;
  odds1x: number;
  /** شوک ترکیب T-60 (برای بازسازی زنجیره واکنشی پس از reload) */
  lineupAnnounced?: boolean;
  lineupShockHome?: number | null;
  lineupShockAway?: number | null;
  // ─── v4.0 — تلهمتری زنده ───
  dataSource?: string; // SEED | ESPN | SPORTSDB
  homeLogo?: string | null;
  awayLogo?: string | null;
  venueName?: string | null;
  venueCity?: string | null;
  weatherTemp?: number | null;
  weatherWind?: number | null;
  weatherPrecip?: number | null;
  weatherAdjusted?: boolean;
  oddsSource?: string; // ENGINE | ESPN_DRAFTKINGS | ODDS_API
  status: string;
  latestAnalysis: {
    id: string;
    bestMarket: string;
    bestEv: number;
    confidence: number;
    source: string;
  } | null;
}

export interface AnalysisResultDTO {
  source: "LLM" | "ENGINE_FALLBACK";
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
    oddsOver25: number;
    oddsUnder25: number;
    odds1x: number;
  };
  engineBaseline: {
    lambdaHome: number;
    lambdaAway: number;
    pHome: number;
    pDraw: number;
    pAway: number;
  };
  analysis: {
    id: string;
    probabilities: {
      home: number;
      draw: number;
      away: number;
      over25: number;
      under25: number;
      btts?: number;
    };
    goalsExpectation: { home: number; away: number };
    scenarios: { name: string; probability: number; description: string }[];
    tacticalMatchup: {
      homeStyle: string;
      awayStyle: string;
      tempo: "LOW" | "MEDIUM" | "HIGH";
      keyBattles: string[];
      summary: string;
    };
    riskFlags: string[];
    narrative: string;
    confidence: number;
    evs: {
      home: number;
      draw: number;
      away: number;
      over25: number;
      under25: number;
    };
    bestMarket: string;
    bestEv: number;
    bestKey: string;
    riskFlag: string;
    p1x: number;
    createdAt: string;
  };
}

export interface RiskLegDTO {
  match: string;
  market: string;
  selection: string;
  odds: number;
  prob: number;
}

export interface RiskResultDTO {
  banker: {
    match: string;
    selection: string;
    marketName: string;
    odds: number;
    prob: number;
    baseSafe: boolean;
  };
  variable: {
    match: string;
    over: { odds: number; prob: number };
    under: { odds: number; prob: number };
  };
  tips: {
    id: string;
    label: string;
    legs: RiskLegDTO[];
    totalOdds: number;
    stake: number;
    potentialReturn: number;
    profitIfWin: number;
    prob: number;
  }[];
  dutching: {
    strategy: string;
    impliedSum: number;
    arbitrageFree: boolean;
    guaranteedMargin: number;
    bothLoseProb: number;
    expectedValue: number | null;
  };
  trap: {
    verdict: "NONE" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
  };
  batchId: string;
}

export interface BacktestResultDTO {
  config: {
    totalMatches: number;
    minEdge: number;
    bankroll: number;
    stakePercent: number;
    seed: number;
  };
  totalBets: number;
  wins: number;
  strikeRate: number;
  roi: number;
  finalEquity: number;
  avgClv: number;
  positiveClvRate: number;
  maxDrawdown: number;
  bets: {
    i: number;
    market: string;
    oddsTaken: number;
    oddsClosing: number;
    modelProb: number;
    won: boolean;
    profit: number;
    clv: number;
    equity: number;
  }[];
  /** مقایسه سه استراتژی مدیریت سرمایه در یک شبیه‌سازی واحد */
  strategies: {
    key: "FIXED" | "KELLY25" | "DUTCH2";
    label: string;
    totalBets: number;
    wins: number;
    strikeRate: number;
    roi: number;
    finalEquity: number;
    avgClv: number;
    positiveClvRate: number;
    maxDrawdown: number;
    curve: { i: number; equity: number }[];
  }[];
  drawdownReduction: number; // کاهش افت سرمایه داچینگ نسبت به Fixed
  verdict: "EXCELLENT" | "GOOD" | "MARGINAL" | "FAIL";
  verdictMessage: string;
}

// ═══════════════════════════════════════════════════════
// سطح اول (Institutional-Grade) — تایپ‌های ماژول‌های پیشرفته
// ═══════════════════════════════════════════════════════

/** مقایسه روش‌های حذف حاشیه (Shin / Power / Multiplicative) روی خط هر بوک‌میکر */
export interface DevigRowDTO {
  bookmaker: string;
  bookmakerLabel: string;
  marginPct: number; // حاشیه خام (Overround)
  shinProbs: { home: number; draw: number; away: number };
  shinZ: number; // نسبت معامله‌گران آگاه مدل شین
  powerK: number;
  sharp: boolean; // Pinnacle = خط مرجع Sharp
}

/** خروجی هر زیر-ایجنت در مناظره */
export interface AgentBriefDTO {
  role: "BULL" | "BEAR" | "JUDGE";
  title: string;
  thesis: string;
  arguments: string[];
  factorDeltas?: { home: number; draw: number; away: number; over25: number };
  confidence: number;
  source: "LLM" | "ENGINE_FALLBACK" | "LOCAL_QUANT";
}

/** پاسخ کامل مناظره چندایجنتی */
export interface DebateResultDTO {
  success: boolean;
  source: "LLM" | "ENGINE_FALLBACK" | "LOCAL_QUANT";
  /** v5.0 — سپر ضد Rate-Limit: true یعنی درخواست LLM به صف خورد و موتور محلی جایگزین شد */
  rateLimited?: boolean;
  /** v5.0 — پیام وضعیت سپر (کش / صف / موتور محلی) */
  notice?: string | null;
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    referee: string | null;
  };
  quantitative: {
    lambdaHome: number;
    lambdaAway: number;
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    pUnder25: number;
    pBtts: number;
    gamestateNote: string | null;
    fatigueNote: string | null;
    refereeNote: string | null;
    lineupShockNote: string | null;
  };
  devig: DevigRowDTO[];
  sharpProbs: { home: number; draw: number; away: number } | null;
  bull: AgentBriefDTO;
  bear: AgentBriefDTO;
  judge: AgentBriefDTO;
  final: {
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    analysisId: string;
    confidence: number;
    calibrationApplied: string | null;
  };
}

/** یک انتخاب (Selection) در پرتفوی با بهترین قیمت یافت‌شده */
export interface PortfolioSelectionDTO {
  key: string; // HOME | DRAW | AWAY | DC_1X | DC_X2 | O25 | U25 | BTTS_Y | BTTS_N | C_O95 | C_U95
  label: string;
  matchId: string;
  matchLabel: string;
  modelProb: number;
  bestOdds: number;
  bestBook: string;
  sharpOdds: number | null;
  evPct: number;
}

/** ساختار داخلی زوج — کلیدهای پایه/متغیر برای نقشه پوشش و اشکال‌زدایی */
export interface PairStructureDTO {
  baseKey: string; // پایه امن (DC_1X | DC_X2) — برای زوج متعامد v5.0: "ORTHO"
  varAKey: string; // متغیر تیپ A (O25 | U25 | O15 | U35 | BTTS_Y | BTTS_N | C_O95 | C_U95)
  varBKey: string; // متغیر تیپ B (مقابل متغیر A یا بازار دوگانه)
  varAMatchId: string; // بازی متغیر A (میکس دو بازی = بازی دوم)
  varBMatchId: string;
  /** v5.0 — زوج متعامد: فهرست کامل شرط‌های تیپ A و B از ۱۵ بازار (بدون پایه مشترک) */
  legsA?: string[];
  legsB?: string[];
  /** زوج باندی (خطوط هم‌خانواده با ناحیه طلایی) — O15_U25 یا O25_U35 */
  band: "O15_U25" | "O25_U35" | null;
  /** حاوی خط سینتتیک مبتنی بر مدل (O15/U35 بدون قیمت واقعی بوک‌میکر) */
  synthetic: boolean;
  /** زوج دو-برد (Double-Win): هر دو تیپ می‌توانند همزمان ببرند */
  doubleWin: boolean;
}

/** زوج تیپ مکمل ساخته‌شده توسط موتور مونت‌کارلو + کلِی */
export interface PortfolioPairDTO {
  id: string;
  kind: "SINGLE_MATCH_BUILDER" | "TWO_MATCH_MIX";
  labelA: string;
  labelB: string;
  structure: PairStructureDTO;
  selectionA: PortfolioSelectionDTO;
  selectionB: PortfolioSelectionDTO;
  totalOddsA: number;
  totalOddsB: number;
  jointStates: { bothWin: number; aOnly: number; bOnly: number; bothLose: number };
  impliedSum: number;
  guaranteedMarginPct: number;
  equalProfit: { stakeA: number; stakeB: number; profit: number };
  kelly: { fA: number; fB: number; growth: number };
  /** لبه CLV تقریبی نسبت به خط شارپ پیناکل (null = خط سینتتیک/در دسترس نیست) */
  sharpEdgePct: number | null;
  /** v5.0 — متادیتای الگوی متعامد (روی فلش‌کارت نمایش داده می‌شود) */
  archetype?: { code: string; name: string; short: string; rationale: string; orthogonalityPct: number; coveragePct: number; overlapPct: number };
  trap: { verdict: "NONE" | "WARNING" | "CRITICAL"; title: string; message: string };
  verdict: string;
}

/** خروجی کامل ایجنت پرتفوی (مونت‌کارلو کاپولا + کلِی همزمان) */
export interface PortfolioResultDTO {
  success: boolean;
  primary: {
    matchId: string;
    matchLabel: string;
    lambdaHome: number;
    lambdaAway: number;
  };
  monteCarlo: {
    sims: number;
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    pBtts: number;
    cornersOver95: number;
    cardsOver35: number;
    avgCorners: number;
    avgCards: number;
    corrGoalsCorners: number;
  };
  selections: PortfolioSelectionDTO[];
  pairs: PortfolioPairDTO[];
  recommendedId: string | null;
  batchId: string | null;
  bankroll: number;
}

// ═══════════════════════════════════════════════════════
// v5.0 — منابع ضرایب رایگان (Free Odds APIs)
// ═══════════════════════════════════════════════════════

export type OddsSourceKey = "ESPN_CORE" | "POLYMARKET" | "THE_ODDS_API" | "ODDS_API_IO" | "FOOTBALL_DATA";

/** وضعیت سلامت هر منبع ضرایب (مودال API + جدول مقایسه‌ای تب ۲) */
export interface OddsSourceStatusDTO {
  key: OddsSourceKey;
  label: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
  keyRequired: boolean;
  keyPresent: boolean;
  signupUrl: string;
  docsUrl: string;
  oddsCount: number;
}

/** یک سطر جدول مقایسه ضرایب بین منابع */
export interface OddsComparisonRowDTO {
  source: string;
  sourceLabel: string;
  home: number | null;
  draw: number | null;
  away: number | null;
  note: string;
}

/** فید واقعی Football-Data.co.uk برای بک‌تست CLV */
export interface FootballDataDTO {
  success: boolean;
  leagueName: string;
  season: string;
  rows: {
    date: string;
    homeTeam: string;
    awayTeam: string;
    fthg: number | null;
    ftag: number | null;
    psh: number | null;
    psd: number | null;
    psa: number | null;
    pOver25: number | null;
    pUnder25: number | null;
  }[];
}

/** گزارش شوک T-60 — اعلام ترکیب رسمی و بازمحاسبه قدرت با VAEP/xT */
export interface LineupShockDTO {
  success: boolean;
  matchId: string;
  home: {
    team: string;
    xiVaep: number;
    xiXt: number;
    fullStrengthVaep: number;
    shockDelta: number;
    missingKeyPlayers: { name: string; position: string; xT: number; vaep: number; status: string }[];
    unavailableCount: number;
  };
  away: {
    team: string;
    xiVaep: number;
    xiXt: number;
    fullStrengthVaep: number;
    shockDelta: number;
    missingKeyPlayers: { name: string; position: string; xT: number; vaep: number; status: string }[];
    unavailableCount: number;
  };
  isShock: boolean;
  message: string;
  topPlayers: {
    side: "HOME" | "AWAY";
    name: string;
    position: string;
    xT: number;
    vaep: number;
    status: string;
    isKey: boolean;
  }[];
}

/** سیگنال پوشش زنده (In-Play Hedge Trigger) */
export interface LiveHedgeDTO {
  success: boolean;
  minute: number;
  scenario: string;
  scenarioLabel: string;
  score: string;
  remainingLambdas: { home: number; away: number };
  updatedProbs: { home: number; draw: number; away: number };
  fairLiveOdds: { home: number; draw: number; away: number };
  marketLiveOdds: { home: number; draw: number; away: number };
  preBet: { selection: string; label: string; odds: number; stake: number };
  hedge: {
    targetOdds: number;
    targetLabel: string;
    stake: number;
    profitIfPre: number;
    profitIfHedge: number;
  } | null;
  holdEV: number;
  recommendation: "HEDGE" | "HOLD";
  message: string;
}

/** داشبورد کالیبراسیون (امتیاز بریر + اصلاح خودکار) */
export interface CalibrationDTO {
  success: boolean;
  overall: {
    count: number;
    avgBrier: number;
    hitRate: number;
    avgPredicted: number;
    brierSkillVsRandom: number; // 1 − Brier/0.25
    brierSkillScore: number; // BSS استاندارد = (1 − Brier/0.25) × 100
    pinnacleBrier: number; // خط مرجع پیناکل = 0.192
    vsPinnacleDelta: number; // بریر مدل منهای بریر پیناکل (منفی = بهتر از پیناکل)
  };
  byLeague: {
    league: string;
    count: number;
    avgBrier: number;
    hitRate: number;
    calibrationFactor: number; // ضریب اصلاحی اعمال‌شده در تحلیل بعدی
    note: string;
  }[];
  buckets: { bucket: string; predicted: number; observed: number; n: number }[];
  logs: {
    id: string;
    matchLabel: string;
    league: string;
    pick: string;
    predictedProb: number;
    outcome: string;
    brier: number;
    lesson: string | null;
  }[];
  lessons: string[];
}
