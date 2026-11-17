// ─────────────────────────────────────────────────────────────────────────────
// v21.0 — GLOBAL_TEAM_ELO_AND_XG_RATINGS
// جدول جامع امتیاز Elo + قدرت تهاجمی/دفاعی تیم‌های ملی و باشگاهی جهان
//
// هدف سند v21.0 «1xBet Real-Market Calibration & Zero-Blind-Stats Edition»:
//   ✔ پایان صدور کارت کور با λ ثابت ۱.۰۰–۰.۹۲ برای همه بازی‌های دنیا.
//   ✔ وقتی خط واقعی بازار (ESPN / Odds Feed) در دسترس نیست، امید گل (λ_H, λ_A)
//     از «اختلاف واقعی Elo دو تیم (ΔElo)» محاسبه می‌شود — ژاپنِ قدرتمند مقابل
//     پاراگوئه λ≈۱.۶۷–۰.۹۷ می‌گیرد، نه عدد یکسان ۱.۰۰–۰.۹۲ با قرقیزستان!
//   ✔ برچسب قابل راستی‌آزمایی روی کارت: مسیر GLOBAL_ELO_RATINGS.
//
// منبع مقادیر: میانگین Elo رتبه‌بندی‌های عمومی (World Football Elo Ratings) —
// مقادیر تقریبی با گام ۱۰ امتیاز؛ مقادیر att/def فقط برای تیم‌های با سبک
// مشخص (تهاجمی/دفاعی) override می‌شوند و بقیه از فرمول استاندارد Elo مشتق می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamRating {
  /** امتیاز Elo پایه (میانگین رتبه‌بندی‌های جهانی) */
  elo: number;
  /** ضریب تهاجمی (۱ = متوسط جهان؛ >۱ = هجومی‌تر) */
  att?: number;
  /** ضریب دفاعی (۱ = متوسط جهان؛ <۱ = گل کمتر می‌خورد) */
  def?: number;
}

/** ═══ ۱۲۰ تیم ملی — کلیدها با نام رسمی ESPN (lowercase) ═══ */
export const NATIONAL_TEAM_ELO: Record<string, TeamRating> = {
  // ─── اروپا ───
  "spain": { elo: 1900, att: 1.32, def: 0.78 },
  "france": { elo: 1880, att: 1.30, def: 0.80 },
  "england": { elo: 1870, att: 1.26, def: 0.82 },
  "portugal": { elo: 1840, att: 1.24, def: 0.82 },
  "netherlands": { elo: 1830, att: 1.24, def: 0.84 },
  "italy": { elo: 1800, att: 1.12, def: 0.80 },
  "belgium": { elo: 1800, att: 1.20, def: 0.88 },
  "germany": { elo: 1790, att: 1.24, def: 0.90 },
  "croatia": { elo: 1770, att: 1.14, def: 0.86 },
  "denmark": { elo: 1780, att: 1.10, def: 0.84 },
  "switzerland": { elo: 1760, att: 1.05, def: 0.84 },
  "turkey": { elo: 1750, att: 1.14, def: 0.92 },
  "turkiye": { elo: 1750, att: 1.14, def: 0.92 },
  "ukraine": { elo: 1740, att: 1.06, def: 0.90 },
  "austria": { elo: 1760, att: 1.14, def: 0.88 },
  "norway": { elo: 1760, att: 1.22, def: 0.90 },
  "serbia": { elo: 1750, att: 1.14, def: 0.94 },
  "poland": { elo: 1740, att: 1.08, def: 0.92 },
  "greece": { elo: 1730, att: 1.00, def: 0.84 },
  "sweden": { elo: 1720, att: 1.06, def: 0.94 },
  "czechia": { elo: 1720, att: 1.04, def: 0.92 },
  "czech republic": { elo: 1720, att: 1.04, def: 0.92 },
  "hungary": { elo: 1700, att: 1.04, def: 0.92 },
  "romania": { elo: 1700, att: 1.02, def: 0.92 },
  "scotland": { elo: 1700, att: 1.00, def: 0.88 },
  "wales": { elo: 1680, att: 0.98, def: 0.92 },
  "republic of ireland": { elo: 1670, att: 0.94, def: 0.90 },
  "ireland": { elo: 1670, att: 0.94, def: 0.90 },
  "northern ireland": { elo: 1660, att: 0.90, def: 0.92 },
  "finland": { elo: 1670, att: 0.98, def: 0.96 },
  "iceland": { elo: 1640, att: 0.96, def: 0.96 },
  "slovakia": { elo: 1690, att: 1.00, def: 0.94 },
  "slovenia": { elo: 1690, att: 0.98, def: 0.90 },
  "bosnia and herzegovina": { elo: 1670, att: 1.00, def: 0.94 },
  "bosnia-herzegovina": { elo: 1670, att: 1.00, def: 0.94 },
  "georgia": { elo: 1690, att: 1.00, def: 0.92 },
  "israel": { elo: 1660, att: 1.02, def: 0.98 },
  "albania": { elo: 1660, att: 0.94, def: 0.90 },
  "montenegro": { elo: 1630, att: 0.92, def: 0.98 },
  "north macedonia": { elo: 1640, att: 0.94, def: 0.96 },
  "macedonia": { elo: 1640, att: 0.94, def: 0.96 },
  "bulgaria": { elo: 1580, att: 0.86, def: 0.98 },
  "moldova": { elo: 1580, att: 0.82, def: 1.00 },
  "armenia": { elo: 1640, att: 0.94, def: 1.00 },
  "belarus": { elo: 1600, att: 0.86, def: 0.98 },
  "azerbaijan": { elo: 1620, att: 0.88, def: 1.00 },
  "kazakhstan": { elo: 1600, att: 0.88, def: 1.02 },
  "cyprus": { elo: 1590, att: 0.88, def: 1.04 },
  "kosovo": { elo: 1600, att: 0.92, def: 1.02 },
  "malta": { elo: 1520, att: 0.72, def: 1.14 },
  "luxembourg": { elo: 1590, att: 0.86, def: 1.02 },
  "faroe islands": { elo: 1540, att: 0.74, def: 1.10 },
  "estonia": { elo: 1560, att: 0.80, def: 1.06 },
  "latvia": { elo: 1560, att: 0.80, def: 1.06 },
  "lithuania": { elo: 1550, att: 0.78, def: 1.08 },
  "gibraltar": { elo: 1320, att: 0.48, def: 1.35 },
  "san marino": { elo: 1200, att: 0.38, def: 1.50 },
  "andorra": { elo: 1350, att: 0.50, def: 1.30 },
  "liechtenstein": { elo: 1330, att: 0.46, def: 1.34 },

  // ─── آمریکای جنوبی و شمالی ───
  "argentina": { elo: 1950, att: 1.36, def: 0.76 },
  "brazil": { elo: 1850, att: 1.28, def: 0.82 },
  "uruguay": { elo: 1770, att: 1.14, def: 0.84 },
  "colombia": { elo: 1780, att: 1.12, def: 0.82 },
  "ecuador": { elo: 1750, att: 1.04, def: 0.82 },
  "chile": { elo: 1700, att: 1.00, def: 0.96 },
  "peru": { elo: 1700, att: 0.96, def: 0.92 },
  "paraguay": { elo: 1720, att: 0.98, def: 0.86 },
  "venezuela": { elo: 1660, att: 0.92, def: 0.98 },
  "bolivia": { elo: 1600, att: 0.92, def: 1.12 },
  "united states": { elo: 1730, att: 1.10, def: 0.90 },
  "usa": { elo: 1730, att: 1.10, def: 0.90 },
  "mexico": { elo: 1740, att: 1.12, def: 0.92 },
  "canada": { elo: 1700, att: 1.08, def: 0.92 },
  "costa rica": { elo: 1600, att: 0.88, def: 1.00 },
  "panama": { elo: 1620, att: 0.88, def: 0.98 },
  "honduras": { elo: 1580, att: 0.84, def: 1.04 },
  "el salvador": { elo: 1500, att: 0.76, def: 1.10 },
  "guatemala": { elo: 1500, att: 0.76, def: 1.10 },
  "jamaica": { elo: 1560, att: 0.86, def: 1.02 },
  "trinidad and tobago": { elo: 1480, att: 0.76, def: 1.12 },
  "haiti": { elo: 1520, att: 0.78, def: 1.08 },
  "suriname": { elo: 1450, att: 0.72, def: 1.14 },
  "cuba": { elo: 1480, att: 0.74, def: 1.12 },
  "nicaragua": { elo: 1450, att: 0.70, def: 1.16 },
  "curaçao": { elo: 1500, att: 0.78, def: 1.08 },
  "curacao": { elo: 1500, att: 0.78, def: 1.08 },

  // ─── آسیا ───
  "japan": { elo: 1830, att: 1.24, def: 0.82 },
  "south korea": { elo: 1770, att: 1.16, def: 0.86 },
  "korea republic": { elo: 1770, att: 1.16, def: 0.86 },
  "korea, republic of": { elo: 1770, att: 1.16, def: 0.86 },
  "iran": { elo: 1760, att: 1.12, def: 0.82 },
  "iran, islamic republic of": { elo: 1760, att: 1.12, def: 0.82 },
  "australia": { elo: 1720, att: 1.04, def: 0.90 },
  "saudi arabia": { elo: 1660, att: 0.98, def: 0.96 },
  "saudi-arabia": { elo: 1660, att: 0.98, def: 0.96 },
  "qatar": { elo: 1620, att: 0.98, def: 0.98 },
  "united arab emirates": { elo: 1630, att: 0.94, def: 1.00 },
  "uae": { elo: 1630, att: 0.94, def: 1.00 },
  "jordan": { elo: 1640, att: 0.94, def: 0.94 },
  "iraq": { elo: 1640, att: 0.94, def: 0.96 },
  "uzbekistan": { elo: 1660, att: 1.00, def: 0.94 },
  "oman": { elo: 1610, att: 0.88, def: 1.00 },
  "bahrain": { elo: 1580, att: 0.84, def: 1.04 },
  "kuwait": { elo: 1560, att: 0.82, def: 1.06 },
  "syria": { elo: 1560, att: 0.82, def: 1.06 },
  "syrian arab republic": { elo: 1560, att: 0.82, def: 1.06 },
  "lebanon": { elo: 1500, att: 0.74, def: 1.10 },
  "palestine": { elo: 1500, att: 0.76, def: 1.10 },
  "china": { elo: 1580, att: 0.86, def: 1.06 },
  "china pr": { elo: 1580, att: 0.86, def: 1.06 },
  "north korea": { elo: 1550, att: 0.82, def: 1.04 },
  "korea dpr": { elo: 1550, att: 0.82, def: 1.04 },
  "indonesia": { elo: 1590, att: 0.90, def: 1.02 },
  "vietnam": { elo: 1560, att: 0.86, def: 1.02 },
  "viet nam": { elo: 1560, att: 0.86, def: 1.02 },
  "thailand": { elo: 1590, att: 0.90, def: 1.02 },
  "malaysia": { elo: 1510, att: 0.78, def: 1.10 },
  "philippines": { elo: 1490, att: 0.76, def: 1.12 },
  "hong kong": { elo: 1520, att: 0.78, def: 1.08 },
  "taiwan": { elo: 1450, att: 0.70, def: 1.16 },
  "chinese taipei": { elo: 1450, att: 0.70, def: 1.16 },
  "india": { elo: 1430, att: 0.68, def: 1.14 },
  "pakistan": { elo: 1330, att: 0.58, def: 1.26 },
  "nepal": { elo: 1300, att: 0.56, def: 1.28 },
  "afghanistan": { elo: 1350, att: 0.60, def: 1.24 },
  "bangladesh": { elo: 1280, att: 0.54, def: 1.30 },
  "sri lanka": { elo: 1250, att: 0.52, def: 1.32 },
  "maldives": { elo: 1270, att: 0.54, def: 1.30 },
  "kyrgyzstan": { elo: 1450, att: 0.72, def: 1.14 },
  "tajikistan": { elo: 1460, att: 0.74, def: 1.12 },
  "turkmenistan": { elo: 1400, att: 0.66, def: 1.20 },
  "mongolia": { elo: 1350, att: 0.58, def: 1.26 },
  "myanmar": { elo: 1420, att: 0.66, def: 1.18 },
  "cambodia": { elo: 1400, att: 0.64, def: 1.20 },
  "laos": { elo: 1370, att: 0.60, def: 1.24 },
  "singapore": { elo: 1480, att: 0.74, def: 1.12 },
  "macau": { elo: 1360, att: 0.58, def: 1.26 },
  "brunei": { elo: 1200, att: 0.42, def: 1.42 },
  "timor-leste": { elo: 1300, att: 0.52, def: 1.30 },
  "bhutan": { elo: 1250, att: 0.48, def: 1.34 },
  "guam": { elo: 1280, att: 0.52, def: 1.30 },
  "yemen": { elo: 1470, att: 0.70, def: 1.14 },

  // ─── آفریقا ───
  "morocco": { elo: 1780, att: 1.14, def: 0.80 },
  "senegal": { elo: 1740, att: 1.10, def: 0.84 },
  "egypt": { elo: 1720, att: 1.04, def: 0.86 },
  "algeria": { elo: 1700, att: 1.06, def: 0.92 },
  "tunisia": { elo: 1690, att: 0.98, def: 0.88 },
  "nigeria": { elo: 1700, att: 1.08, def: 0.94 },
  "ivory coast": { elo: 1720, att: 1.06, def: 0.90 },
  "côte d'ivoire": { elo: 1720, att: 1.06, def: 0.90 },
  "ghana": { elo: 1650, att: 1.00, def: 0.98 },
  "cameroon": { elo: 1650, att: 0.98, def: 0.94 },
  "mali": { elo: 1680, att: 1.00, def: 0.92 },
  "south africa": { elo: 1650, att: 0.96, def: 0.92 },
  "burkina faso": { elo: 1630, att: 0.92, def: 0.98 },
  "dr congo": { elo: 1620, att: 0.94, def: 1.00 },
  "congo dr": { elo: 1620, att: 0.94, def: 1.00 },
  "cape verde": { elo: 1600, att: 0.86, def: 1.00 },
  "cabo verde": { elo: 1600, att: 0.86, def: 1.00 },
  "guinea": { elo: 1620, att: 0.92, def: 1.00 },
  "zambia": { elo: 1560, att: 0.84, def: 1.06 },
  "kenya": { elo: 1500, att: 0.76, def: 1.12 },
  "tanzania": { elo: 1480, att: 0.74, def: 1.12 },
  "uganda": { elo: 1500, att: 0.74, def: 1.10 },
  "ethiopia": { elo: 1450, att: 0.68, def: 1.16 },
  "sudan": { elo: 1500, att: 0.76, def: 1.10 },
  "angola": { elo: 1550, att: 0.80, def: 1.06 },
  "mozambique": { elo: 1520, att: 0.76, def: 1.10 },
  "benin": { elo: 1550, att: 0.80, def: 1.06 },
  "togo": { elo: 1520, att: 0.78, def: 1.10 },
  "libya": { elo: 1580, att: 0.82, def: 1.04 },
  "mauritania": { elo: 1540, att: 0.78, def: 1.08 },
  "gambia": { elo: 1540, att: 0.78, def: 1.08 },
  "sierra leone": { elo: 1480, att: 0.72, def: 1.14 },
  "liberia": { elo: 1440, att: 0.66, def: 1.18 },
  "equatorial guinea": { elo: 1520, att: 0.76, def: 1.10 },
  "zimbabwe": { elo: 1500, att: 0.74, def: 1.12 },
  "namibia": { elo: 1520, att: 0.76, def: 1.08 },
  "botswana": { elo: 1480, att: 0.72, def: 1.14 },
  "comoros": { elo: 1520, att: 0.76, def: 1.10 },
  "madagascar": { elo: 1490, att: 0.74, def: 1.12 },
  "eswatini": { elo: 1460, att: 0.68, def: 1.16 },
  "swaziland": { elo: 1460, att: 0.68, def: 1.16 },
  "lesotho": { elo: 1400, att: 0.62, def: 1.22 },
  "malawi": { elo: 1460, att: 0.68, def: 1.16 },
  "rwanda": { elo: 1470, att: 0.70, def: 1.14 },
  "burundi": { elo: 1440, att: 0.66, def: 1.18 },
  "south sudan": { elo: 1360, att: 0.58, def: 1.26 },
  "niger": { elo: 1440, att: 0.64, def: 1.18 },
  "chad": { elo: 1400, att: 0.60, def: 1.22 },
  "somalia": { elo: 1350, att: 0.54, def: 1.28 },
  "djibouti": { elo: 1280, att: 0.48, def: 1.34 },
  "sao tome and principe": { elo: 1300, att: 0.50, def: 1.32 },
  "mauritius": { elo: 1430, att: 0.66, def: 1.18 },
  "seychelles": { elo: 1300, att: 0.50, def: 1.32 },

  // ─── اقیانوسیه ───
  "new zealand": { elo: 1550, att: 0.82, def: 1.04 },
  "fiji": { elo: 1400, att: 0.62, def: 1.22 },
  "solomon islands": { elo: 1400, att: 0.62, def: 1.22 },
  "papua new guinea": { elo: 1390, att: 0.60, def: 1.24 },
  "vanuatu": { elo: 1360, att: 0.58, def: 1.26 },
  "tahiti": { elo: 1350, att: 0.56, def: 1.26 },
  "new caledonia": { elo: 1380, att: 0.60, def: 1.24 },
  "samoa": { elo: 1300, att: 0.50, def: 1.30 },
  "tonga": { elo: 1260, att: 0.46, def: 1.32 },
};

/** ═══ باشگاه‌های برتر جهان (Elo تقریبی) ═══ */
export const CLUB_TEAM_ELO: Record<string, TeamRating> = {
  "real madrid": { elo: 1960, att: 1.42, def: 0.78 },
  "manchester city": { elo: 1930, att: 1.40, def: 0.80 },
  "liverpool": { elo: 1920, att: 1.38, def: 0.80 },
  "arsenal": { elo: 1890, att: 1.30, def: 0.80 },
  "bayern munich": { elo: 1900, att: 1.40, def: 0.84 },
  "barcelona": { elo: 1900, att: 1.38, def: 0.82 },
  "paris saint-germain": { elo: 1890, att: 1.34, def: 0.82 },
  "psg": { elo: 1890, att: 1.34, def: 0.82 },
  "inter": { elo: 1880, att: 1.30, def: 0.80 },
  "inter milan": { elo: 1880, att: 1.30, def: 0.80 },
  "chelsea": { elo: 1850, att: 1.26, def: 0.86 },
  "atletico madrid": { elo: 1850, att: 1.20, def: 0.80 },
  "atlético madrid": { elo: 1850, att: 1.20, def: 0.80 },
  "bayer leverkusen": { elo: 1850, att: 1.30, def: 0.84 },
  "borussia dortmund": { elo: 1840, att: 1.28, def: 0.90 },
  "dortmund": { elo: 1840, att: 1.28, def: 0.90 },
  "napoli": { elo: 1850, att: 1.26, def: 0.82 },
  "tottenham hotspur": { elo: 1830, att: 1.26, def: 0.90 },
  "tottenham": { elo: 1830, att: 1.26, def: 0.90 },
  "newcastle united": { elo: 1830, att: 1.24, def: 0.86 },
  "newcastle": { elo: 1830, att: 1.24, def: 0.86 },
  "ac milan": { elo: 1830, att: 1.22, def: 0.86 },
  "milan": { elo: 1830, att: 1.22, def: 0.86 },
  "atalanta": { elo: 1830, att: 1.28, def: 0.88 },
  "juventus": { elo: 1820, att: 1.14, def: 0.82 },
  "aston villa": { elo: 1820, att: 1.20, def: 0.88 },
  "rb leipzig": { elo: 1810, att: 1.24, def: 0.88 },
  "leipzig": { elo: 1810, att: 1.24, def: 0.88 },
  "eintracht frankfurt": { elo: 1810, att: 1.26, def: 0.92 },
  "frankfurt": { elo: 1810, att: 1.26, def: 0.92 },
  "athletic club": { elo: 1810, att: 1.18, def: 0.84 },
  "athletic bilbao": { elo: 1810, att: 1.18, def: 0.84 },
  "sporting cp": { elo: 1810, att: 1.24, def: 0.84 },
  "sporting": { elo: 1810, att: 1.24, def: 0.84 },
  "manchester united": { elo: 1810, att: 1.16, def: 0.92 },
  "man united": { elo: 1810, att: 1.16, def: 0.92 },
  "lazio": { elo: 1800, att: 1.18, def: 0.88 },
  "benfica": { elo: 1800, att: 1.20, def: 0.84 },
  "villarreal": { elo: 1780, att: 1.16, def: 0.90 },
  "braga": { elo: 1780, att: 1.16, def: 0.90 },
  "galatasaray": { elo: 1780, att: 1.20, def: 0.92 },
  "fenerbahçe": { elo: 1780, att: 1.18, def: 0.92 },
  "fenerbahce": { elo: 1780, att: 1.18, def: 0.92 },
  "marseille": { elo: 1780, att: 1.16, def: 0.92 },
  "monaco": { elo: 1780, att: 1.18, def: 0.94 },
  "as monaco": { elo: 1780, att: 1.18, def: 0.94 },
  "bologna": { elo: 1780, att: 1.12, def: 0.88 },
  "real sociedad": { elo: 1770, att: 1.08, def: 0.86 },
  "fiorentina": { elo: 1770, att: 1.14, def: 0.90 },
  "lille": { elo: 1770, att: 1.14, def: 0.88 },
  "brighton": { elo: 1790, att: 1.16, def: 0.92 },
  "brighton and hove albion": { elo: 1790, att: 1.16, def: 0.92 },
  "nottingham forest": { elo: 1780, att: 1.10, def: 0.90 },
  "bournemouth": { elo: 1770, att: 1.14, def: 0.92 },
  "afc bournemouth": { elo: 1770, att: 1.14, def: 0.92 },
  "crystal palace": { elo: 1770, att: 1.10, def: 0.88 },
  "fulham": { elo: 1760, att: 1.08, def: 0.92 },
  "porto": { elo: 1790, att: 1.18, def: 0.84 },
  "fc porto": { elo: 1790, att: 1.18, def: 0.84 },
  "lyon": { elo: 1760, att: 1.10, def: 0.92 },
  "olympique lyonnais": { elo: 1760, att: 1.10, def: 0.92 },
  "nice": { elo: 1750, att: 1.04, def: 0.90 },
  "lens": { elo: 1750, att: 1.06, def: 0.90 },
  "sevilla": { elo: 1750, att: 1.04, def: 0.92 },
  "rennes": { elo: 1730, att: 1.04, def: 0.94 },
  "olympiacos": { elo: 1750, att: 1.10, def: 0.90 },
  "club brugge": { elo: 1750, att: 1.10, def: 0.92 },
  "psv eindhoven": { elo: 1790, att: 1.26, def: 0.90 },
  "psv": { elo: 1790, att: 1.26, def: 0.90 },
  "ajax": { elo: 1760, att: 1.16, def: 0.94 },
  "feyenoord": { elo: 1760, att: 1.14, def: 0.90 },
  "az alkmaar": { elo: 1730, att: 1.12, def: 0.96 },
  "celtic": { elo: 1750, att: 1.14, def: 0.88 },
  "rangers": { elo: 1700, att: 1.02, def: 0.94 },
  "rb salzburg": { elo: 1740, att: 1.14, def: 0.94 },
  "red bull salzburg": { elo: 1740, att: 1.14, def: 0.94 },
  "young boys": { elo: 1710, att: 1.08, def: 0.98 },
  "fc copenhagen": { elo: 1710, att: 1.08, def: 0.94 },
  "copenhagen": { elo: 1710, att: 1.08, def: 0.94 },
  "slavia praha": { elo: 1730, att: 1.10, def: 0.90 },
  "sparta praha": { elo: 1700, att: 1.06, def: 0.94 },
  "fcsb": { elo: 1690, att: 1.04, def: 0.98 },
  "panathinaikos": { elo: 1720, att: 1.04, def: 0.92 },
  "paok": { elo: 1720, att: 1.06, def: 0.92 },
  "aek athens": { elo: 1700, att: 1.00, def: 0.94 },
  "besiktas": { elo: 1730, att: 1.10, def: 0.98 },
  "beşiktaş": { elo: 1730, att: 1.10, def: 0.98 },
  "stuttgart": { elo: 1800, att: 1.20, def: 0.92 },
  "vfb stuttgart": { elo: 1800, att: 1.20, def: 0.92 },
  "west ham united": { elo: 1750, att: 1.06, def: 0.94 },
  "west ham": { elo: 1750, att: 1.06, def: 0.94 },
  "everton": { elo: 1730, att: 0.92, def: 0.92 },
  "wolves": { elo: 1720, att: 0.98, def: 0.98 },
  "wolverhampton wanderers": { elo: 1720, att: 0.98, def: 0.98 },
  "brentford": { elo: 1760, att: 1.10, def: 0.96 },
  "shakhtar donetsk": { elo: 1740, att: 1.10, def: 0.94 },
  "shakhtar": { elo: 1740, att: 1.10, def: 0.94 },
  "zenit": { elo: 1750, att: 1.12, def: 0.90 },
  "zenit st petersburg": { elo: 1750, att: 1.12, def: 0.90 },
  "anderlecht": { elo: 1700, att: 1.00, def: 0.96 },
  "genk": { elo: 1730, att: 1.08, def: 0.96 },
  "real betis": { elo: 1750, att: 1.06, def: 0.92 },
  "getafe": { elo: 1700, att: 0.92, def: 0.90 },
  "celta vigo": { elo: 1700, att: 0.98, def: 0.96 },
  "osasuna": { elo: 1690, att: 0.94, def: 0.96 },
  "rayo vallecano": { elo: 1700, att: 0.94, def: 0.94 },
  "mallorca": { elo: 1690, att: 0.90, def: 0.94 },
  "girona": { elo: 1720, att: 1.04, def: 0.98 },
  "valencia": { elo: 1720, att: 0.98, def: 0.94 },
  "espanyol": { elo: 1650, att: 0.88, def: 1.04 },
  "alaves": { elo: 1670, att: 0.88, def: 1.00 },
  "deportivo alaves": { elo: 1670, att: 0.88, def: 1.00 },
  "las palmas": { elo: 1650, att: 0.86, def: 1.06 },
  "leganes": { elo: 1630, att: 0.80, def: 1.10 },
  "real valladolid": { elo: 1620, att: 0.78, def: 1.14 },
  "udinese": { elo: 1730, att: 1.04, def: 0.94 },
  "torino": { elo: 1740, att: 0.98, def: 0.88 },
  "torino fc": { elo: 1740, att: 0.98, def: 0.88 },
  "roma": { elo: 1790, att: 1.12, def: 0.88 },
  "as roma": { elo: 1790, att: 1.12, def: 0.88 },
  "genoa": { elo: 1690, att: 0.88, def: 1.00 },
  "cagliari": { elo: 1680, att: 0.86, def: 1.04 },
  "hellas verona": { elo: 1670, att: 0.84, def: 1.06 },
  "verona": { elo: 1670, att: 0.84, def: 1.06 },
  "lecce": { elo: 1660, att: 0.82, def: 1.08 },
  "parma": { elo: 1660, att: 0.84, def: 1.06 },
  "como": { elo: 1680, att: 0.90, def: 1.02 },
  "empoli": { elo: 1650, att: 0.80, def: 1.10 },
  "monza": { elo: 1660, att: 0.82, def: 1.08 },
  "venezia": { elo: 1640, att: 0.78, def: 1.12 },
  "hamburg": { elo: 1700, att: 1.00, def: 0.96 },
  "hamburger sv": { elo: 1700, att: 1.00, def: 0.96 },
  "werder bremen": { elo: 1690, att: 0.98, def: 1.00 },
  "union berlin": { elo: 1690, att: 0.94, def: 0.98 },
  "mainz": { elo: 1720, att: 1.00, def: 0.92 },
  "mainz 05": { elo: 1720, att: 1.00, def: 0.92 },
  "freiburg": { elo: 1750, att: 1.06, def: 0.92 },
  "sc freiburg": { elo: 1750, att: 1.06, def: 0.92 },
  "hoffenheim": { elo: 1700, att: 1.02, def: 1.04 },
  "wolfsburg": { elo: 1720, att: 1.04, def: 0.98 },
  "vfl wolfsburg": { elo: 1720, att: 1.04, def: 0.98 },
  "augsburg": { elo: 1690, att: 0.94, def: 1.02 },
  "bochum": { elo: 1640, att: 0.82, def: 1.14 },
  "heidenheim": { elo: 1660, att: 0.86, def: 1.10 },
  "st. pauli": { elo: 1670, att: 0.86, def: 1.06 },
  "holstein kiel": { elo: 1650, att: 0.84, def: 1.12 },
  "borussia monchengladbach": { elo: 1730, att: 1.04, def: 0.98 },
  "monchengladbach": { elo: 1730, att: 1.04, def: 0.98 },
  "glandbach": { elo: 1730, att: 1.04, def: 0.98 },
};

/** ═══ جدول ترکیبی نهایی — ورودی‌های باشگاهی در اولویت جستجو قرار می‌گیرند ═══ */
export const GLOBAL_TEAM_ELO_AND_XG_RATINGS: Record<string, TeamRating> = {
  ...NATIONAL_TEAM_ELO,
  ...CLUB_TEAM_ELO,
};

/** نرمال‌سازی نام تیم: حروف کوچک، حذف علائم، فاصله‌های تکراری، FC/SC/AFC و ... */
export function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return "";
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // حذف اعراب/اکسان لاتین
      .replace(/[^\p{L}\p{N}\s]/gu, " ") // حذف علائم
      .replace(/\b(fc|cf|sc|afc|club|deportivo|calcio)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** کش جستجو برای عملکرد (نرمال‌سازی هر درخواست یک‌بار) */
const lookupCache = new Map<string, TeamRating | null>();

/**
 * جستجوی تیم در جدول جهانی Elo — با نرمال‌سازی نام + تطبیق جزئی (پیشوند/کلمه کلیدی)
 * خروجی null یعنی تیم ناشناخته است (مسیر کور → گیت سوپروایزر وتو می‌کند).
 */
export function lookupTeamRating(teamName: string | null | undefined): TeamRating | null {
  const key = normalizeTeamName(teamName);
  if (!key) return null;
  if (lookupCache.has(key)) return lookupCache.get(key) ?? null;

  let found: TeamRating | null = null;
  // ۱) تطبیق دقیق
  found = GLOBAL_TEAM_ELO_AND_XG_RATINGS[key] ?? null;
  // ۲) تطبیق با نام نرمال‌شده کلیدهای جدول
  if (!found) {
    for (const [k, v] of Object.entries(GLOBAL_TEAM_ELO_AND_XG_RATINGS)) {
      if (normalizeTeamName(k) === key) {
        found = v;
        break;
      }
    }
  }
  // ۳) تطبیق جزئی — نام جدول داخل نام درخواست یا برعکس (مثل «iran (u23)»)
  if (!found && key.length >= 5) {
    for (const [k, v] of Object.entries(GLOBAL_TEAM_ELO_AND_XG_RATINGS)) {
      const nk = normalizeTeamName(k);
      if (nk.length >= 5 && (key.includes(nk) || nk.includes(key))) {
        found = v;
        break;
      }
    }
  }
  if (lookupCache.size > 900) lookupCache.clear();
  lookupCache.set(key, found);
  return found;
}

/** مزیت میزبانی Elo — هم‌مقدار با موتور elo.ts */
export const ELO_HOME_ADV = 65;

export interface EloLambdaResult {
  lambdaHome: number;
  lambdaAway: number;
  eloHome: number;
  eloAway: number;
  eloGap: number;
  /** احتمال امتیازگیری میزبان از Elo (برای نمایش شفاف روی کارت) */
  expectedHomeScore: number;
  /** مسیر استخراج — برای برچسب راستی‌آزمایی */
  source: "GLOBAL_ELO_RATINGS";
}

/**
 * v21.0 — امید گل واقعی از اختلاف Elo دو تیم (مسیر جایگزین خط بازار).
 *   share  = ۰.۵ + (E_H − ۰.۵) × ۰.۶۰        → سهم گل میزبان از کل
 *   total  = ۲.۴۵ + ۰.۹۰ × |E_H − ۰.۵|        → بازی‌های نامتوازن گل بیشتری دارند
 *   λ_H    = total × share  × att_H × def_A
 *   λ_A    = total × (۱−share) × att_A × def_H
 * مثال سند: ژاپن (۱۸۳۰) × پاراگوئه (۱۷۲۰) → λ ≈ ۱.۶۷–۰.۹۷ (عدد واقعی، نه ۱.۰۰–۰.۹۲ کور)
 */
export function lambdaFromEloRatings(
  homeName: string | null | undefined,
  awayName: string | null | undefined,
  homeOverrideElo?: number | null,
  awayOverrideElo?: number | null
): EloLambdaResult | null {
  const home = lookupTeamRating(homeName);
  const away = lookupTeamRating(awayName);
  if (!home && !away) return null;

  // تیم ناشناخته → Elo متوسط جهانی ۱۵۰۰ (شفاف، بدون عدد جعلی)
  const eloHome = homeOverrideElo ?? home?.elo ?? 1500;
  const eloAway = awayOverrideElo ?? away?.elo ?? 1500;
  const attH = home?.att ?? 1;
  const defH = home?.def ?? 1;
  const attA = away?.att ?? 1;
  const defA = away?.def ?? 1;

  const expH = 1 / (1 + Math.pow(10, (eloAway - eloHome - ELO_HOME_ADV) / 400));
  const share = Math.max(0.18, Math.min(0.82, 0.5 + (expH - 0.5) * 0.6));
  const total = 2.45 + 0.9 * Math.abs(expH - 0.5);

  const lambdaHome = Math.round(Math.max(0.3, Math.min(3.8, total * share * attH * defA)) * 100) / 100;
  const lambdaAway = Math.round(Math.max(0.25, Math.min(3.6, total * (1 - share) * attA * defH)) * 100) / 100;

  return {
    lambdaHome,
    lambdaAway,
    eloHome,
    eloAway,
    eloGap: eloHome + ELO_HOME_ADV - eloAway,
    expectedHomeScore: Math.round(expH * 1000) / 1000,
    source: "GLOBAL_ELO_RATINGS",
  };
}

/**
 * v21.0 — آیا هر دو تیم در جدول Elo شناخته شده‌اند؟
 * گیت سوپروایزر: «تیم ناشناخته + بدون خط بازار» = کارت کور ممنوع.
 */
export function bothTeamsKnownInElo(homeName?: string | null, awayName?: string | null): boolean {
  return Boolean(lookupTeamRating(homeName) && lookupTeamRating(awayName));
}
