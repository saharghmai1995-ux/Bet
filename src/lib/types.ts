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
  // ─── v6.0 — سند راستی‌آزمایی داده (Data Verification Inspector) ───
  externalId?: string | null; // espn-<slug>-<eventId>
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeRank?: number | null; // رتبه واقعی جدول فصل
  homeGF?: number | null; // گل زده واقعی فصل میزبان
  homeGA?: number | null;
  homeGP?: number | null;
  awayRank?: number | null;
  awayGF?: number | null;
  awayGA?: number | null;
  awayGP?: number | null;
  leagueTeamAvg?: number | null; // میانگین گل هر تیم/بازی از جدول واقعی
  statsSource?: string | null; // ESPN_STANDINGS | RECORD_FALLBACK
  statsFetchedAt?: string | null; // آخرین واکشی جدول رده‌بندی
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
  /** v15.0 — نام رسمی بین‌المللی مارکت تیپ A (انگلیسی — Institutional Execution Metadata) */
  marketAEn?: string;
  /** v15.0 — نام رسمی بین‌المللی مارکت تیپ B (انگلیسی) */
  marketBEn?: string;
  /** v15.0 — نشان رسمی قانون تسویه: ۹۰ دقیقه وقت قانونی — بدون وقت اضافه */
  settlementRule?: string;
  structure: PairStructureDTO;
  selectionA: PortfolioSelectionDTO;
  selectionB: PortfolioSelectionDTO;
  totalOddsA: number;
  totalOddsB: number;
  jointStates: { bothWin: number; aOnly: number; bOnly: number; bothLose: number };
  impliedSum: number;
  guaranteedMarginPct: number;
  equalProfit: { stakeA: number; stakeB: number; profit: number };
  /** v19.0 — تخصیص شتاب‌دهنده نامتقارن (Asymmetric Alpha Staking) — پیش‌فرض فعال:
   *  ۶۵ واحد روی تیپ A (~۲.۱۰x) + ۳۵ واحد روی تیپ B (~۳.۱۰x):
   *  برد A = +۳۶.۵u · برد B = اصل پول + ۸.۵٪ · برد همزمان 1-0/2-0 = جک‌پات +۱۴۵u */
  accelerator?: {
    active: boolean;
    stakeA: number;
    stakeB: number;
    profitOnA: number;
    profitOnB: number;
    /** کمینه سود دو بال — «سود تضمینی» کارت با استیک نامتقارن */
    guaranteed: number;
    profitOnDoubleWin: number;
    note: string;
  };
  kelly: { fA: number; fB: number; growth: number };
  /** لبه CLV تقریبی نسبت به خط شارپ پیناکل (null = خط سینتتیک/در دسترس نیست) */
  sharpEdgePct: number | null;
  /** v5.0 — متادیتای الگوی متعامد (روی فلش‌کارت نمایش داده می‌شود) */
  archetype?: { code: string; name: string; short: string; rationale: string; orthogonalityPct: number; coveragePct: number; overlapPct: number };
  /** v23.0 — متادیتای حل‌کننده کوانتومی ۱۲×۱۲ (انتخاب اختصاصی این بازی از ۶۶ ترکیب) */
  quantum?: {
    pairCode: string;
    evaluated: number;
    qualifying: number;
    utility: number;
    cardLine: string;
    doubleWinScenarios: string[];
    aOnlyScenarios: string[];
    bOnlyScenarios: string[];
  };
  /** v24.0 — گزارش اجرای موتور QQL + تحلیل ریشه‌ای هوش مصنوعی (AI RCA Trace) */
  qql?: {
    executedQueryLog: string[];
    aiRcaDiagnosis: string;
    firedRules: string[];
    knnTwins: number;
    knnSummary: string | null;
    winnerPairCode: string | null;
    vetoedPairs: string[];
  };
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
    /** v9.0 — شفافیت کامل λ: الگوی Odds بازار / آمار فصل / ترکیبی نهایی */
    lambdaMarketHome: number | null;
    lambdaMarketAway: number | null;
    lambdaStatsHome: number;
    lambdaStatsAway: number;
    lambdaFitError: number | null;
    lambdaCalibrationHome: number;
    lambdaCalibrationAway: number;
  };
  /** v9.0 — متن قوانین فعال کالیبراسیون لیگ این بازی (برای سطر فلش‌کارت) */
  calibrationRule: string[];
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
  /**
   * v17.0 — مسیریاب غیرخطی ۵ رژیمی Bet-Type (Non-Linear Multi-Regime Router):
   * سنجه‌های آنتروپی/Rλ/Top4 ماتریس ۶×۶ + کاندیدهای ۴ روش تک‌بازی با امتیاز
   * Non-Linear Sharpe & Kelly Utility + واریانت برنده سوپروایزر.
   */
  betTypeRouter?: import("./engine/betrouter").BetTypeRouteResult | null;
  /**
   * v23.0/v24.0 — گزارش اجرای حل‌کننده کوانتومی ۱۲×۱۲ + موتور QQL/RCA برای این بازی:
   * متن کوئری اجراشده، تحلیل ریشه‌ای هوش مصنوعی، دوقلوهای K-NN و بهترین ترکیب کوانتومی.
   */
  qql?: {
    executedQueryLog: string[];
    aiRcaDiagnosis: string;
    firedRules: string[];
    vetoedPairs: string[];
    knnTwins: number;
    knnSummary: string | null;
    winnerPairCode: string | null;
    stageCounts: { stage0: number; stage1: number; stage2: number; stage3: number };
    quantumBestPairCode: string | null;
    quantumCardLine: string | null;
    quantumQualifying: number;
    quantumEvaluated: number;
  } | null;
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
  // ─── v6.0 — دیتای واقعی ESPN (Zero-Mock) ───
  /** OFFICIAL = ترکیب رسمی اعلام‌شده از summary · SEASON = آمار فصل واقعی (پیش از اعلام) */
  mode?: "OFFICIAL" | "SEASON" | "UNAVAILABLE";
  fetchedAt?: string;
  /** اندپوینت‌های واقعی استفاده‌شده — برای باکس راستی‌آزمایی */
  sources?: string[];
  espnEventUrl?: string | null;
  espnEventId?: string | null;
  players?: { home: LineupPlayerDTO[]; away: LineupPlayerDTO[] };
  /** v6.0 — پیش‌نمایش غیبت بازیکن واقعی (کلیک کاربر روی کلید وضعیت) */
  absPreview?: LineupAbsPreviewDTO | null;
}

/** v6.0 — بازیکن واقعی از Roster/Summary API با آمار فصل جاری */
export interface LineupPlayerDTO {
  name: string; // displayName واقعی ESPN
  position: string; // GK | DEF | MID | FW (از position.abbreviation)
  age: number | null;
  appearances: number | null; // بازی فصل جاری
  goals: number | null; // گل واقعی فصل
  assists: number | null; // پاس گل واقعی فصل
  shotsOnTarget: number | null;
  /** شاخص VAEP واقعی: (G×۰.۳۵ + A×۰.۲۵ + SoT×۰.۰۸) / appearances */
  vaep: number | null;
  /** شاخص تهدید (xT تقریبی): (G×۰.۴۵ + A×۰.۳۰ + SoT×۰.۱۰) / appearances */
  xT: number | null;
  starter: boolean | null; // فقط در حالت OFFICIAL
  status: "STARTER" | "BENCH" | "SQUAD" | "NO_STATS";
  isKey: boolean; // ۴ شاخص برتر تیم بر اساس VAEP واقعی
}

/** v6.0 — اثر غیبت یک بازیکن واقعی روی λ و احتمالات */
export interface LineupAbsPreviewDTO {
  name: string;
  side: "HOME" | "AWAY";
  vaepShare: number; // سهم بازیکن از VAEP ترکیب
  shockDelta: number; // دلتای اعمال‌شده روی λ
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  baseline: { lambdaHome: number; lambdaAway: number; pHome: number; pDraw: number; pAway: number };
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
  /**
   * v19.0-restore — سپر استاپ‌لاس زنده دقیقه ۶۵ (وقتی زوج‌تیپ A/B ارسال شود).
   * تله میانی از دقیقه ۶۵ → زیان سقف‌دار −۴۵.۰u به‌جای ریسک −۱۰۰u کامل.
   */
  minute65Shield: {
    active: boolean;
    state: "INACTIVE" | "TRAP_ARMED" | "SHIELD_HOLD" | "EXIT_NOW" | "SAFE_ZONE";
    liveZone: "DOUBLE_WIN" | "A_ONLY" | "B_ONLY" | "MIDDLE_TRAP";
    escapeProb: number | null;
    cappedLossUnits: number | null;
    uncappedLossUnits: number | null;
    recoveryUnits: number | null;
    exitPlan: string | null;
    message: string;
  } | null;
}

// ═══════════════════════════════════════════════════════
// v9.0 — بردار قانون فعال کالیبراسیون (Active Calibration Rule Vector)
// ═══════════════════════════════════════════════════════

/** یک قانون فعال لیگ — کلاینت‌سِیف (خروجی GET /api/calibration/rules) */
export interface ActiveRuleDTO {
  league: string;
  /** تعداد بازی‌های تسویه‌شده مبنای قانون */
  sample: number;
  /** ٪ انحراف میانگین گل واقعی از λ پیش‌بینی */
  goalBiasPct: number | null;
  /** ضریب اعمالی روی λ موتور (مثلاً ۰.۹۴ = −۶٪) */
  lambdaMultiplier: number;
  /** پاداش/جریمه عددی UtilityScore هر الگو (A1..A5) */
  archetypeBoosts: Record<string, number>;
  archetypeHitRate: Record<string, { wins: number; total: number; profit: number }>;
  /** متن قوانین فعال فارسی */
  rules: string[];
  /** نشان «⚡ اعمال‌شده در فرمول سوپروایزر» */
  applied: boolean;
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

// ═══════════════════════════════════════════════════════
// v7.0 — موتور تسویه خودکار پس از پایان بازی (Automated Post-Match Grader)
// ═══════════════════════════════════════════════════════

/** یک شرط (Leg) از تیپ — با شناسه ESPN بازی برای تسویه میکس دو بازی */
export interface SettlementLegDTO {
  key: string; // HOME | DRAW | AWAY | DC_1X | DC_X2 | O25 | U25 | O15 | U35 | BTTS_Y | ...
  matchExternalId?: string | null; // espn-<slug>-<id> — پیش‌فرض همان بازی کارت
  matchLabel?: string | null;
}

export type SlipStatus = "PENDING" | "LIVE" | "WON_A" | "WON_B" | "DOUBLE_WIN" | "MIDDLE_TRAP" | "MANUAL_REVIEW" | "VOID";

/** ردیف کارنامه — کارت صادرشده با تیپ A/B داچینگ و وضعیت تسویه */
export interface IssuedSlipDTO {
  id: string;
  hash: string; // SHA-256 سند راستی‌آزمایی
  externalId: string | null;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  labelA: string;
  labelB: string;
  legsA: SettlementLegDTO[];
  legsB: SettlementLegDTO[];
  oddsA: number;
  oddsB: number;
  stakeA: number;
  stakeB: number;
  guaranteedProfit: number;
  marginPct: number;
  archetype: string | null;
  /** v9.0 — کد الگو (A1..A5) برای حلقه فعال کالیبراسیون */
  archetypeCode: string | null;
  /** v9.0 — λ ترکیبی نهایی مدل در لحظه صدور (مبنای انحراف گلزنی لیگ) */
  lambdaHome: number | null;
  lambdaAway: number | null;
  /** v9.0 — فقط کارت‌های تایید سوپروایزر به تلگرام می‌روند */
  supervisorApproved: boolean;
  /** v9.0 — صادرشده توسط خط لوله خودکار سرور (Zero-Click) */
  autoIssued: boolean;
  /** v13.2 — کارت بازخوانی (بازی FT پیش از صدور) — مستثنا از وین‌ریت واقعی و اعلام کانال */
  retroIssued: boolean;
  // ─── v11.0 — دفتر سایه (Shadow Ledger) ───
  supervisorScore: number | null;
  vetoReason: string | null;
  jointLossRiskPct: number | null;
  doubleWinProbPct: number | null;
  /** v18.0 — سطح تاج: GOLD (استیک کامل ۱۰۰u) | SILVER_SHADOW (استیک نصف ۵۰u) | null */
  crownTier: string | null;
  /** v19.0 — خط تولید Bet-Type (SINGLE/COMBO/BANKER/CORRECT_SCORE/ACCUMULATOR) — ویترین ۵ رژیم */
  productLine: string | null;
  espnUrl: string | null;
  status: SlipStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  profitA: number | null;
  profitB: number | null;
  netProfit: number | null;
  settledAt: string | null;
  settleNote: string | null;
  telegramCard: boolean;
  telegramTeaser: boolean;
  telegramResult: boolean;
  // ─── v10.0 — ارزش عددی پیناکل + پنجره زمانی طلایی ثبت ───
  pinnacleOddsA: number | null;
  pinnacleOddsB: number | null;
  edgeA: number | null;
  edgeB: number | null;
  edgeSourceA: string | null;
  edgeSourceB: string | null;
  modelProbA: number | null;
  modelProbB: number | null;
  tipKindA: string | null;
  tipKindB: string | null;
  timingWindowA: string | null;
  timingWindowB: string | null;
  timingStartA: string | null;
  timingEndA: string | null;
  timingStartB: string | null;
  timingEndB: string | null;
  createdAt: string;
}

/** آمار تجمیعی کارنامه */
export interface SettlementStatsDTO {
  total: number;
  pending: number;
  live: number;
  wonA: number;
  wonB: number;
  doubleWin: number;
  middleTrap: number;
  manual: number;
  void: number;
  settled: number;
  netProfit: number;
  /** سود خالص نسبت به مجموع استیک‌های تسویه‌شده (٪) */
  netProfitPct: number;
  staked: number;
  /** ═══ v20.0 — سنجه‌های واحد منبع حقیقت (computeMasterLedgerMetrics) ═══ */
  /** تعداد برد (wonA + wonB + doubleWin) — تعریف واحد برد در کل سیستم */
  wins: number;
  /** تعداد باخت کامل (middleTrap) */
  losses: number;
  /** وین‌ریت واقعی = wins ÷ settled × ۱۰۰ */
  winRatePct: number | null;
  /** Yield/ROI واقعی روی حجم استیک = netProfit ÷ staked × ۱۰۰ */
  yieldPct: number | null;
  /** رشد بانک ۱۰۰۰ واحدی = netProfit ÷ ۱۰۰۰ × ۱۰۰ */
  bankGrowthPct: number;
}

/** خروجی همگام‌سازی و تسویه خودکار با سرور ESPN */
export interface SettlementSyncResultDTO {
  success: boolean;
  checkedEspn: number; // تعداد رخدادهای ESPN بررسی‌شده (۳ روز + امروز — v9.0)
  ftFound: number; // تعداد بازی‌های FT یافت‌شده
  settled: { id: string; matchLabel: string; status: SlipStatus; netProfit: number }[];
  live: number;
  notified: number; // پیام‌های تلگرام ارسال‌شده
  /** v9.0 — خروجی خط لوله ثبت خودکار بازی‌های ۳ روز اخیر */
  autoRegistered?: { scanned: number; past: number; today: number; vetoed: number; skippedExisting: number };
  elapsedMs: number;
  error?: string;
}

/**
 * v21.0 — آمار تفکیکی بانک در یک بازه (روز / هفته / ماه) — ماژول حرفه‌ای منحنی بانک.
 * هر ردیف: تغییر خالص بانک + تعداد بازی‌های روز + برد/باخت + سطح بانک پایان دوره.
 */
export interface BankPeriodStat {
  /** کلید مرتب‌سازی زمانی (اندیس روز/هفته/ماه با شیفت تهران) */
  key: string;
  /** برچسب نمایشی شمسی (مثل «۱۶ آبان» یا «آبان» یا «هفتهٔ ۱۲ آبان») */
  label: string;
  /** تغییر خالص بانک در این بازه (واحد) */
  netProfit: number;
  /** تعداد بازی‌های تسویه‌شده در این بازه */
  settled: number;
  /** تعداد برد (WON_A / WON_B / DOUBLE_WIN) */
  wins: number;
  /** تعداد باخت (MIDDLE_TRAP — تله میانی) */
  losses: number;
  /** سطح بانک در پایان این بازه (واحد) */
  bankAtEnd: number;
}

/** خروجی کامل کارنامه + صندوق تلگرام */
export interface LedgerDTO {
  success: boolean;
  /** v20.0 — جدول کارنامه فقط «کتاب رسمی» است (تاییدشده غیربازخوانی)؛ سایه/بازخوانی در دو ویو جدا */
  slips: IssuedSlipDTO[];
  /** v20.0 — ویو کارت‌های وتوشده دفتر سایه (تسویه کاغذی — بدون تیک جکپات در جدول رسمی) */
  shadowSlips: IssuedSlipDTO[];
  /** v20.0 — ویو کارت‌های بازخوانی (تحلیل کاغذی پس از FT) */
  retroSlips: IssuedSlipDTO[];
  stats: SettlementStatsDTO;
  /**
   * v19.0 — کارت ویترین اثبات سودآوری ۵ رژیم (5-Regime ROI Breakdown):
   * سود خالص/وین‌ریت/میانگین سود هر برد هر یک از ۵ استراتژی — با افراز مجزا
   * (هر کارت فقط در خط تولید خودش شمرده می‌شود) — اعداد کاملاً از کارنامه واقعی ESPN.
   */
  regimes: {
    key: "DUAL_HEDGE" | "COMBO" | "CORRECT_SCORE" | "BANKER" | "ACCUMULATOR" | "SNIPER";
    labelFa: string;
    labelEn: string;
    icon: string;
    settled: number;
    wins: number;
    winRatePct: number | null;
    netProfit: number;
    avgProfitPerWin: number | null;
  }[];
  /** v11.0 — دفتر سایه: آمار تسویه کاغذی کارت‌های وتوشده سوپروایزر (بدون تلگرام) */
  shadow: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netProfit: number;
    byStatus: Record<string, number>;
  };
  /** v13.2 — دفتر بازخوانی: کارت‌های چندروزه که هرگز پیش‌بازی صادر نشده‌اند (جدا از آمار واقعی) */
  retroBook: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netProfit: number;
  };
  /**
   * v18.0 — 🥈 حصاد آلفای سایه (Tier-2 Shadow Alpha Harvester):
   * آمار کارت‌های تاج نقره‌ای سطح ۲ که به‌جای حبس در دفتر کاغذی با استیک نصف
   * ۵۰ واحدی Half-Kelly منتشر و تسویه واقعی شدند + منحنی بانک جداگانه.
   */
  silverHarvest: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netProfit: number;
    /** منحنی رشد بانک جداگانه کارت‌های نقره‌ای (استیک ۵۰u) — همان START_BANK=1000 */
    equityPoints: number[];
    finalBank: number;
    roiPct: number;
  };
  outbox: { id: string; kind: string; ok: boolean; detail: string | null; slipHash: string | null; createdAt: string }[];
  telegram: { configured: boolean; channelSet: boolean };
  // ─── v10.0 — ژورنال + دفتر دکترین + وضعیت اتوماسیون سرور + مبنا واحد ───
  journal: JournalEntryDTO[];
  doctrine: DoctrineSummaryDTO[];
  automation: { schedulerActive: boolean; lastTickAt: string | null; lastDailyReportAt: string | null; intervalSec: number };
  unitBasis: { stakePerTicket: number; unitPctOfBankroll: number; exampleBankrollUsd: number };
  /**
   * v13.5 — منحنی رشد بانک ۱۰۰۰ واحدی (محاسبه سمت سرور از «تمام» تاریخ کارنامه).
   * رفع باگ قبلی: منحنی فقط از ۱۲۰ ردیف آخر دیتابیس ساخته می‌شد و کارت‌های بازخوانی
   * (retroIssued) را هم شامل می‌شد → انتهای منحنی با «سود خالص مجموع» تیتر یکی نبود.
   * اکنون سرور همه کارت‌های تاییدشده غیربازخوانی تسویه‌شده را به‌ترتیب settledAt جمع می‌زند
   * و نقطه اول دقیقاً ۱۰۰۰ و نقطه آخر دقیقاً ۱۰۰۰ + stats.netProfit است.
   */
  equity: {
    startBank: number;
    points: number[];
    finalBank: number;
    roiPct: number;
    /** تعداد کارت‌های واقعاً لحاظ‌شده در منحنی (هم‌مبنا با stats.settled) */
    basis: number;
    /** v13.5.1 — بازه زمانی واقعی تسویه‌های منحنی برای برچسب محور نمودار */
    firstSettledAt: string | null;
    lastSettledAt: string | null;
    /**
     * v21.0 — ماژول حرفه‌ای منحنی بانک (Bank Growth Analytics):
     * سری زمان‌دار کامل + تجمیع روزانه/هفتگی/ماهانه + streak/drawdown.
     */
    series: { t: string; v: number }[];
    /** تغییرات روزانه — ۱۴ روز اخیر تهران (شامل روزهای خالی) */
    daily: BankPeriodStat[];
    /** تغییرات هفتگی — ۸ هفته اخیر */
    weekly: BankPeriodStat[];
    /** تغییرات ماهانه — ۶ ماه اخیر */
    monthly: BankPeriodStat[];
    /** رگبار فعلی (برد/باخت متوالی) از آخرین تسویه رسمی */
    streak: { type: "W" | "L" | null; count: number };
    /** بیشترین افت سرمایه تاریخی (peak-to-trough ٪) */
    maxDrawdownPct: number;
    /** اوج تاریخی بانک */
    peakBank: number;
  };
  /**
   * v18.0 — نبض کارنامه: تشخیص شفاف «چرا آمار/وین‌ریت/منحنی تغییری نکرده».
   * آمار رسمی فقط کارت‌های تایید سوپروایزر را می‌شمارد؛ اگر گیت v16 همه کارت‌های
   * تازه را وتو کند، منحنی تخت می‌ماند — این نبض همان وضعیت را عددی نشان می‌دهد.
   */
  pulse: {
    /** آخرین تسویه رسمی (ISO) */
    lastSettledAt: string | null;
    /** تسویه‌های رسمی ۷ روز اخیر */
    settled7d: number;
    /** تسویه‌های رسمی امروز تهران */
    settledToday: number;
    /** کارت‌های تاییدشده در انتظار نتیجه (همه تاریخ‌ها) */
    pendingApproved: number;
    /** کارت‌های تاییدشده بازی‌های امروز تهران (در انتظار کیک‌آف/زنده) */
    approvedLiveToday: number;
    /** مجموع کارت‌های وتوشده سوپروایزر (دفتر سایه — زنده) */
    vetoedTotal: number;
  };
  /** ═══ v20.0 — خروجی رسمی computeMasterLedgerMetrics — تنها منبع آمار همه باکس‌ها ═══ */
  master: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    winRatePct: number | null;
    netProfit: number;
    totalStaked: number;
    yieldPct: number | null;
    bankGrowthPct: number;
    finalBank: number;
  };
}

/** آیتم صدور کارت از سبد فلش‌کارت‌ها (بدنه POST /api/settlement/issue) */
export interface JournalEntryDTO {
  id: string;
  league: string;
  matchLabel: string;
  status: string;
  netProfit: number | null;
  archetypeCode: string | null;
  timingWindow: string | null;
  lesson: string;
  createdAt: string;
}

/** یک دکترین ثبت‌شده در دفتر یادگیری */
export interface DoctrineSummaryDTO {
  id: string;
  kind: string; // LEAGUE_LAMBDA | ARCHETYPE | TIMING_WINDOW
  scope: string;
  summary: string;
  multiplier: number;
  sampleSize: number;
  netProfit: number;
  winRate: number;
  active: boolean;
  updatedAt: string;
}

/** آیتم صدور کارت از سبد فلش‌کارت‌ها (بدنه POST /api/settlement/issue) */
export interface IssueSlipItemDTO {
  match: {
    id: string;
    externalId?: string | null;
    league: string;
    homeTeam: string;
    awayTeam: string;
    kickoff: string;
    espnUrl?: string | null;
  };
  labelA: string;
  labelB: string;
  legsA: SettlementLegDTO[];
  legsB: SettlementLegDTO[];
  oddsA: number;
  oddsB: number;
  stakeA?: number; // اگر نیاید — داچینگ سود برابر روی مجموع ۱۰۰ واحد
  stakeB?: number;
  guaranteedProfit: number;
  marginPct: number;
  archetype?: string | null;
  /** v9.0 — کد الگو (A1..A5) */
  archetypeCode?: string | null;
  /**
   * v17.0 — خط تولید Bet-Type برای افراز مجزای کارنامه:
   * SINGLE (زوج‌تیپ) | COMBO (کمبوی رسمی) | BANKER (تک‌ستون امن) | CS_CLUSTER (خوشه نتیجه دقیق) | SNIPER
   */
  productLine?: string | null;
  lambdaHome?: number | null;
  lambdaAway?: number | null;
  /**
   * v19.0 — احتمال مدل فراخلب (Override) برای کارت‌های میکس چندبازی:
   * آکومولاتور چندبازی را نمی‌توان با ماتریس تک‌بازی ارزیابی کرد — احتمال واقعی
   * = حاصل‌ضرب احتمال هر پای مستقل (از ماتریس دیکسون-کولز همان بازی).
   */
  modelProbAOverride?: number | null;
  modelProbBOverride?: number | null;
  /**
   * v10.0 — خط شارپ مرجع (Pinnacle) برای هر انتخاب مستقیم:
   * کلید = کلید بازار (HOME/DRAW/AWAY/DC_1X/DC_X2/O25/U25) — فقط وقتی ردیف قیمت
   * واقعاً PINNACLE باشد پاس می‌شود؛ در غیر این صورت مرجع، خط منصفانه موتور است.
   */
  pinnaclePrices?: Partial<Record<string, number>>;
  /** v9.0 — بازی وتوشده سوپروایزر هرگز صدور/ارسال نمی‌شود */
  supervisorApproved?: boolean;
  /**
   * v13.2 — کارت بازخوانی: بازی هنگام صدور از قبل FT بوده است (خط لوله چندروزه).
   * هرگز پیش از بازی صادر و منتشر نشده — فقط تسویه کاغذی تحلیلی برای یادگیری دکترین؛
   * از وین‌ریت کانال، اعلام نتایج و دسته الف مستثناست.
   */
  retroIssued?: boolean;
  /** v11.0 — دفتر سایه: سنجه‌های لحظه تصمیم سوپروایزر برای کارت‌های واقعی و سایه */
  supervisorScore?: number | null;
  vetoReason?: string | null;
  jointLossRiskPct?: number | null;
  doubleWinProbPct?: number | null;
  /**
   * v18.0 — سطح تاج کارت (Two-Tier Crown System):
   * "GOLD" = تاج طلایی سطح ۱ (استیک کامل ۱۰۰u) | "SILVER_SHADOW" = تاج نقره‌ای سطح ۲
   * (شکارچی آلفای سایه — استیک نصف ۵۰u به روش Half-Kelly) | null = بدون سطح‌بندی
   */
  crownTier?: string | null;
}

/** v11.0 — آمار عملکرد یک دسته فلش‌کارت (تایید/وتو/سود۱۵/ریسک۱۰/دوبل‌وین) */
export interface CategoryPerformanceDTO {
  // v13.4 — کلیدهای فیلتر دک فلش‌کارت (RISK10/BOOSTER/PROFIT15/FORTRESS) برای «پوشش کامل عملکرد هر فیلتر» اضافه شدند
  // v13.2 — RETRO: دسته پنجم افراز مجزا — کارت‌های بازخوانی (بازی FT پیش از صدور؛ تسویه کاغذی تحلیلی)
  // v17.0 — کلیدهای عملکرد ۵ روش Bet-Type (BANKER / CS_CLUSTER) به افراز مجزا اضافه شدند
  key: "APPROVED" | "VETOED" | "COMBO" | "SNIPER" | "RETRO" | "RISK10" | "BOOSTER" | "PROFIT15" | "FORTRESS" | "BANKER" | "CS_CLUSTER" | "SHADOW_ALPHA" | "TOTAL";
  label: string;
  description: string;
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netProfit: number;
  paper: boolean;
  doubleWinHits: number;
  avgGuaranteedProfitPct: number | null;
  avgJointLossRiskPct: number | null;
  avgDoubleWinProbPct: number | null;
  /** v20.0 — Category ROI واقعی روی حجم استیک (netProfit ÷ totalStaked × ۱۰۰) */
  roiPct?: number | null;
  /** v20.0 — تعلیق خودکار کالیبراسیون (ROI منفی) */
  suspended?: boolean;
  /** v20.0 — دلیل تعلیق (متن سند) */
  suspensionReason?: string | null;
}

export interface CategoryPerformanceResponseDTO {
  success: boolean;
  categories: CategoryPerformanceDTO[];
  /** ═══ v20.0 — حلقه کالیبراسیون خودکار دسته‌ها (تعلیق ROI منفی + بهترین دسته سودده) ═══ */
  calibration?: {
    evaluatedAt: string;
    bestCategory: string | null;
    suspendedCount: number;
    states: {
      category: string;
      labelFa: string;
      settled: number;
      winRatePct: number | null;
      netProfit: number;
      roiPct: number | null;
      suspended: boolean;
      reason: string | null;
    }[];
  };
  /**
   * v13.4 — پوشش کامل عملکرد هر «فیلتر دک فلش‌کارت» (RISK10/BOOSTER/PROFIT15/FORTRESS/APPROVED/VETOED).
   * برخلاف `categories` (افراز ۱۰۰٪ مجزا)، این دسته‌ها همپوشان‌اند: یک کارت می‌تواند هم‌زمان
   * در RISK10 و PROFIT15 شمرده شود. کارت‌های بازخوانی (retroIssued) از عملکرد واقعی حذف می‌شوند.
   */
  filterPerformance?: CategoryPerformanceDTO[];
  shadowLedger: {
    approvedSlips: number;
    shadowSlips: number;
    note: string;
  };
  /** v18.0 — حصاد آلفای سایه: آمار کارت‌های تاج نقره‌ای سطح ۲ (استیک ۵۰u Half-Kelly) */
  silverHarvest?: {
    total: number;
    settled: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netProfit: number;
  };
  generatedAt: string;
}
