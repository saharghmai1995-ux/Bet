# پرامپت جامع مهندسی ارتقای سامانه «فوتبال‌کوانت» به نسخه ۶.۰ (Football Quant v6.0: 100% Zero-Mock-Data & Verifiable Standings/Roster/Odds Edition)

این سند حاوی پرامپت نهایی برای حذف **۳ بخش باقی‌مانده دیتای شبیه‌سازی‌شده (Synthetic Data)** در [نسخه ۵.۰ سامانه فوتبال‌کوانت](https://preview-chat-66016a1c-9f0e-4453-b355-003f3fa2716e.space-z.ai/) است تا ۱۰۰٪ اعداد، بازیکنان، آمار گل فصل و بوک‌میکرها در تمام ۷ تب قابل راستی‌آزمایی و بدون هیچ داده فرضی باشند.

## متن پرامپت آماده کپی برای سازنده سایت (Copy & Paste Prompt)

لطفاً سامانه «فوتبال‌کوانت» (`v5.0`) را به **نسخه ۶.۰ (v6.0 Strict Zero-Simulation & 100% Verifiable Data Edition)** ارتقا بده. در ممیزی نسخه ۵.۰ مشخص شد که داشبورد، فلش‌کارت‌های ۵ الگویی متعامد، فونت فارسی سبد خرید، مسابقات ESPN و اخبار زنده عالی کار می‌کنند؛ اما **۳ بخش در تب‌های داخلی هنوز از دیتای شبیه‌سازی‌شده یا تخمینی (Mock/Synthetic) استفاده می‌کنند**.

قانون طلایی نسخه ۶.۰ این است: **هیچ نام بازیکن فرضی، هیچ بوک‌میکر ساختگی و هیچ دکمه «شبیه‌سازی» نباید در سیستم وجود داشته باشد.** لطفاً این ۳ اصلاح را با اتصال به اندپوینت‌های واقعی بدون کلید ESPN اعمال کن:

### ۱. جایگزینی «ترکیب شبیه‌سازی‌شده T-60» با لیست واقعی بازیکنان و گلزنان تیم از API زنده (Real Team Roster & Lineup API)

- **حذف دکمه شبیه‌سازی:** در تب `T-60 زنده`، دکمه «اعلام رسمی ترکیب (شبیه‌سازی)» و هرگونه لیست بازیکن ثابت/فرضی را کاملاً حذف کن.
- **اتصال به ۲ اندپوینت واقعی بازیکنان در ESPN (بدون نیاز به کلید):**
  1. ابتدا اندپوینت خلاصه بازی را چک کن:
     `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/summary?event=${eventId}`
     اگر بازی در کمتر از ۶۰ دقیقه آینده باشد و آرایه `rosters` در پاسخ JSON پر شده باشد، ترکیب رسمی واقعی (`starter: true/false`) را مستقیماً نمایش بده.
  2. اگر زمان بازی هنوز نرسیده و ترکیب رسمی منتشر نشده است، به جای تولید بازیکن فرضی، درخواست `GET` به اندپوینت **لیست واقعی بازیکنان فصل جاری هر دو تیم** در [ESPN Soccer API](https://github.com/pseudo-r/Public-ESPN-API/blob/main/docs/sports/soccer.md) بزن:
     `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}/roster`
     از آرایه `athletes` در پاسخ JSON، نام واقعی بازیکنان (`displayName`)، پست (`position.abbreviation`)، سن، و آمار واقعی فصل جاری (`statistics`: تعداد بازی `appearances`، گل زده `totalGoals`، پاس گل `goalAssists` و شوت‌ها) را استخراج کن و شاخص `VAEP / xT` هر بازیکن را به صورت واقعی از روی `(totalGoals * 0.35 + goalAssists * 0.25 + shotsOnTarget * 0.08) / appearances` محاسبه کن!
  3. به کاربر اجازه بده روی کلید وضعیت هر بازیکن واقعی کلیک کند تا اثر غیبت احتمالی آن ستاره واقعی را روی امید گل ($\lambda$) ببیند.

### ۲. محاسبه امید گل ($\lambda$) از روی جدول رده‌بندی واقعی کل فصل جاری (Real Season Standings API)

- در نسخه ۵.۰، امید گل ($\lambda_H, \lambda_A$) فقط از روی ۵ حرف فرم اخیر (`WWDLW`) تخمین زده می‌شود.
- برای اینکه خروجی ماتریس ۶×۶ [مدل دیکسون-کولز](https://impliedscore.com/dixon-coles-model/) کاملاً قابل راستی‌آزمایی آماری باشد، اندپوینت بدون کلید **جدول رده‌بندی رسمی فصل جاری (Standings)** را برای هر لیگ فراخوانی کن:
  `https://site.api.espn.com/apis/v2/sports/soccer/${leagueSlug}/standings`
- از آرایه `children[0].standings.entries`، برای هر تیم آمار واقعی فصل جاری را استخراج کن:
  - تعداد بازی انجام‌شده (`gamesPlayed`)
  - تعداد کل گل زده فصل (`pointsFor`)
  - تعداد کل گل خورده فصل (`pointsAgainst`)
  - تفاضل گل و رتبه واقعی در جدول (`rank`)
- سپس قدرت تهاجمی واقعی ($\alpha_i = \text{GoalsFor}_i / (\text{Games}_i \times \text{LeagueAvgGoals})$) و ضعف دفاعی واقعی ($\beta_i = \text{GoalsAgainst}_i / (\text{Games}_i \times \text{LeagueAvgGoals})$) را محاسبه کن و نرخ امید گل دقیق بازی را از فرمول استاندارد دیکسون-کولز ($\lambda_{\text{Home}} = \alpha_{\text{Home}} \times \beta_{\text{Away}} \times \text{LeagueHomeAvg}$) به دست بیاور و این اعداد واقعی (گل زده/خورده فصل و رتبه جدول) را در پشت فلش‌کارت و در تب موتور احتمالات به عنوان **سند راستی‌آزمایی (Verification Proof)** نمایش بده.

### ۳. حذف بوک‌میکرهای فرضی و اتصال جدول ضرایب به اندپوینت واقعی Odds در ESPN Core و Polymarket

- **حذف نام‌های ساختگی:** در جدول مقایسه بوک‌میکرها (تب موتور احتمالات / مناظره)، نام بوک‌میکرهای فرضی مثل «بت‌مسترز» یا «پرسیان‌بت» که ضرایب آن‌ها با فرمول تصادفی ساخته شده را کاملاً حذف کن.
- **استفاده از ضرایب واقعی API:**
  1. برای هر مسابقه، اندپوینت مستقیم ضرایب و احتمالات در [ESPN Core API](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c/b99b9e0d2df72470fa622e2f76cecb0362111e9a) را فراخوانی کن:
     - `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueSlug}/events/${eventId}/competitions/${eventId}/odds`
     - `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueSlug}/events/${eventId}/competitions/${eventId}/probabilities`
  2. در جدول ضرایب، فقط منابع واقعی زیر را با برچسب شفاف منبع داده نمایش بده:
     - **خط رسمی بوک‌میکر ESPN / DraftKings** (مستخرج از فیلد `odds` در JSON مسابقه)
     - **ضریب عادلانه مدل دیکسون-کولز فصل جاری** (مستخرج از آمار واقعی گل زده/خورده جدول فصل در `/standings`)
     - **احتمال مدل تحلیلی ESPN Analytics Predictor** (مستخرج از اندپوینت `/probabilities`)
     - **خط بازار آزاد Polymarket Gamma / The Odds API** (در صورت وجود مسابقه در فید [Polymarket Gamma](https://polymarkets.co.il/en/bots/polymarket-gamma-api-tutorial/) یا وارد شدن کلید [The Odds API v4](https://the-odds-api.com/liveapi/guides/v4/)).
     - اگر برای یک بازی خاص در لیگ‌های فرعی، بوک‌میکر هنوز ضریب منتشر نکرده بود، به جای ساختن ضریب تصادفی، برچسب شفاف `ضریب عادلانه مدل کمّی (پیش از بازگشایی خط بوک‌میکر)` را ثبت کن.

### ۴. افزودن باکس «سند راستی‌آزمایی داده (Data Verification Inspector)» روی هر فلش‌کارت

- در پشت هر فلش‌کارت (یا با کلیک روی آیکون `🔍 راستی‌آزمایی منبع داده`)، یک بخش شفافیت داده قرار بده که به کاربر نشان دهد اعداد این بازی دقیقاً از کجا آمده‌اند:
  - `شناسه رسمی مسابقه در ESPN (Event ID): ${match.id}` (به همراه لینک مستقیم باز کردن صفحه رسمی مسابقه در سایت `espn.com/soccer/match/_/gameId/${match.id}`)
  - `آمار واقعی فصل میزبان: رتبه ${homeRank} | ${homeGF} گل زده و ${homeGA} گل خورده در ${homeGP} بازی`
  - `آمار واقعی فصل میهمان: رتبه ${awayRank} | ${awayGF} گل زده و ${awayGA} گل خورده در ${awayGP} بازی`
  - `زمان دقیق آخرین واکشی از سرور زنده: ${lastFetchedTimestamp}`