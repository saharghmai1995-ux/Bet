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
  verdict: "EXCELLENT" | "GOOD" | "MARGINAL" | "FAIL";
  verdictMessage: string;
}
