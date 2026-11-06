# پرامپت جامع مهندسی ارتقای سامانه «فوتبال‌کوانت» به نسخه ۴.۰ (Football Quant v4.0: Real-Time Public APIs, Live News & Final Fix)

این سند حاوی گزارش ممیزی [نسخه ۳.۰ سامانه فوتبال‌کوانت](https://preview-chat-66016a1c-9f0e-4453-b355-003f3fa2716e.space-z.ai/) و **پرامپت کامل مهندسی به همراه کد آماده اتصال به APIهای واقعی، عمومی و بدون نیاز به کلید (Zero-Key Live APIs)** است. متن بخش زیر را کپی کرده و به سازنده سایت بدهید تا سیستم از حالت «دیتای شبیه‌سازی‌شده» به **«دیتای زنده واقعی مسابقات، اخبار و آمار»** متصل شود و آخرین باگ متنی سبد خرید نیز برطرف گردد.

## متن پرامپت آماده کپی برای سازنده سایت (Copy & Paste Prompt)

لطفاً سامانه «فوتبال‌کوانت» (`v3.0`) را به **نسخه ۴.۰ (v4.0 Live Multi-API Telemetry & Real-Time News Edition)** ارتقا بده. در ممیزی فنی نسخه ۳.۰ مشخص شد که فلش‌کارت‌های سه‌بعدی، رادار ۵ مرحله‌ای، سوییچ Autopilot و سبد تیپ‌ها عالی کار می‌کنند، اما **برنامه هنوز از دیتای شبیه‌سازی‌شده داخلی (Mock Data) استفاده می‌کند** و در **متن کپی سبد تیپ‌های انتخابی هنوز کاراکترهای شکسته (`ٱٱٱ`) وجود دارد**.

لطفاً ۳ دستورالعمل مهندسی زیر را به طور کامل و دقیق در کد اعمال کن:

### ۱. اتصال واقعی و خودکار به ۵ منبع API عمومی و خبری زنده (Zero-Key Real-Time Data Integration)

به جای اینکه منتظر وارد کردن کلید دستی کاربر بمانی و به دیتای ساختگی برگردی، یک ماژول دریافت دیتای زنده (`liveDataService.ts`) بساز که به محض باز شدن سایت، به صورت خودکار (`fetch` مستقیم در مرورگر ویا از طریق API Route داخلی سرور `/api/live-football`) از **APIهای عمومی، رایگان و دارای CORS باز زیر** دیتای واقعی امروز و هفته جاری را استخراج کند:

1. **API زنده مسابقات، آمار تیم‌ها، ترکیب‌ها و ضرایب پایه از ESPN (کاملاً رایگان و بدون نیاز به API Key):**
   - طبق [مستندات اندپوینت‌های عمومی ESPN Soccer API](https://github.com/pseudo-r/Public-ESPN-API/blob/main/docs/sports/soccer.md) و [فهرست اندپوینت‌های JSON زنده ESPN](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)، درخواست‌های `GET` زیر را به صورت موازی (`Promise.allSettled`) برای ۵ لیگ معتبر اروپا و لیگ قهرمانان اجرا کن:
     - لیگ برتر انگلیس (EPL): `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard`
     - لالیگا اسپانیا (LaLiga): `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard`
     - سری آ ایتالیا (Serie A): `https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard`
     - بوندسلیگا آلمان (Bundesliga): `https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard`
     - لیگ ۱ فرانسه (Ligue 1): `https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard`
     - لیگ قهرمانان اروپا (UCL): `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard`
   - **استخراج داده‌های واقعی هر بازی از پاسخ JSON:**
     - از آرایه `events` در پاسخ JSON، نام دقیق تیم میزبان و میهمان (`competitions[0].competitors`)، لوگوی رسمی تیم‌ها (`team.logo`)، ساعت و تاریخ واقعی بازی (`date`)، وضعیت زنده بازی (`status.type.detail`)، فرم ۵ بازی اخیر (`form` مانند `WWDLW`)، آمار گل زده و خورده فصل (`statistics` / `records`) و ضرایب موجود در `competitions[0].odds` را استخراج کن.
   - **دریافت ترکیب رسمی (T-60 Lineups) و آمار ریز بازی:**
     - وقتی کاربر روی یک بازی کلیک می‌کند، درخواست `GET` به اندپوینت جزئیات همان مسابقه بفرست:
       `https://site.api.espn.com/apis/site/v2/sports/soccer/{leagueSlug}/summary?event={eventId}`
     - از فیلد `rosters` (ترکیب اصلی و ذخیره‌ها)، `gameInfo.venue` (نام ورزشگاه و شهر) و `gameInfo.officials` (نام داور مسابقه برای پروفایل داوری در تب ۲) استفاده کن.

2. **API زنده اخبار فوری فوتبال، مصدومیت‌ها و کنفرانس‌های خبری (ESPN Live Soccer News JSON - بدون نیاز به کلید):**
   - برای تغذیه زنده «ایجنت گاو و خرس» و بخش «اخبار و مصدومیت‌ها»، اندپوینت‌های خبری زیر را به صورت زنده فراخوانی کن:
     - `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news`
     - `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/news`
     - `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/news`
   - از آرایه `articles`، تیتر خبر (`headline`)، خلاصه خبر (`description`)، زمان انتشار (`published`) و لینک منبع (`links.web.href`) را استخراج کن و در یک **«نوار و پنل اخبار زنده و مصدومیت‌ها (Live Injury & Tactical News Feed)»** در داشبورد و تب مناظره نمایش بده. اگر نام یکی از دو تیم بازی در خبر وجود داشت، آن خبر را به عنوان مستند واقعی به استدلال ایجنت گاو یا خرس الصاق کن!

3. **API عمومی جدول، رویدادها و اطلاعات باشگاه‌ها از TheSportsDB (با کلید رایگان عمومی `123` بدون ثبت‌نام):**
   - بر اساس [مستندات رسمی TheSportsDB Free API](https://www.thesportsdb.com/free_sports_api)، از کلید عمومی `123` برای دریافت بازی‌های آتی لیگ‌ها و تکمیل اطلاعات تیم‌ها استفاده کن:
     - بازی‌های پیش‌رو لیگ برتر: `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4328`
     - بازی‌های پیش‌رو لالیگا: `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4335`
     - بازی‌های پیش‌رو سری آ: `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4332`
     - بازی‌های پیش‌رو بوندسلیگا: `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4331`

4. **API زنده آب‌وهوای ورزشگاه در لحظه بازی (Open-Meteo Public API - بدون نیاز به کلید):**
   - بر اساس مختصات شهر ورزشگاه، دمای هوا، سرعت باد و بارش باران را از اندپوینت باز `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,precipitation,wind_speed_10m` دریافت کن و اگر بارش بالای `2mm` یا سرعت باد بالای `30km/h` بود، به صورت خودکار ضریب اصلاحی `-8%` روی امید گل ($\lambda$) در موتور دیکسون-کولز اعمال کن و بج `🌧️ تعدیل جوی زنده` را روی فلش‌کارت نشان بده.

5. **اتصال اختیاری به The Odds API v4 (در صورت وارد کردن کلید توسط کاربر در مودال):**
   - طبق [مستندات The Odds API v4](https://the-odds-api.com/liveapi/guides/v4/)، اگر کاربر در مودال تنظیمات کلید `The Odds API` خود را وارد کرد، اندپوینت زیر را فراخوانی کن تا ضرایب زنده Pinnacle و بوک‌میکرهای اروپایی جایگزین ضرایب پایه شوند:
     `https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?regions=eu,uk&markets=h2h,totals&oddsFormat=decimal&apiKey={USER_API_KEY}`

### ۲. الگوی کد آماده برای جایگذاری در سرویس دیتای زنده (`liveDataService.ts`)

از منطق زیر برای تبدیل داده‌های واقعی دریافتی از ESPN و TheSportsDB به ساختار بازی‌های داخل برنامه و محاسبه خودکار امید گل ($\lambda$) و فلش‌کارت‌های تیپ ۲ و ۳ استفاده کن (و فقط در صورتی که کاربر کاملاً آفلاین بود به دیتای ذخیره داخلی Fallback بزن):

```typescript
const ESPN_LEAGUES = [
  { slug: 'eng.1', name: 'لیگ برتر انگلیس', sportsDbId: '4328', avgGoals: 2.85 },
  { slug: 'esp.1', name: 'لالیگا اسپانیا', sportsDbId: '4335', avgGoals: 2.55 },
  { slug: 'ita.1', name: 'سری آ ایتالیا', sportsDbId: '4332', avgGoals: 2.62 },
  { slug: 'ger.1', name: 'بوندسلیگا آلمان', sportsDbId: '4331', avgGoals: 3.12 },
  { slug: 'fra.1', name: 'لیگ ۱ فرانسه', sportsDbId: '4334', avgGoals: 2.70 },
  { slug: 'uefa.champions', name: 'لیگ قهرمانان اروپا', sportsDbId: '4480', avgGoals: 2.95 }
];

export async function fetchAllLiveFootballData() {
  const scoreRequests = ESPN_LEAGUES.map(l =>
    fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l.slug}/scoreboard`)
      .then(r => r.ok ? r.json() : null)
      .then(data => ({ league: l, data }))
      .catch(() => ({ league: l, data: null }))
  );

  const newsRequests = ['eng.1', 'esp.1', 'uefa.champions'].map(slug =>
    fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/news`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  );

  const [scoreResults, newsResults] = await Promise.all([
    Promise.all(scoreRequests),
    Promise.all(newsRequests)
  ]);

  // استخراج اخبار واقعی و مصدومیت‌ها
  const liveNews = newsResults
    .flatMap(n => n?.articles || [])
    .slice(0, 12)
    .map(art => ({
      headline: art.headline,
      description: art.description || '',
      published: art.published,
      url: art.links?.web?.href || '#'
    }));

  // تبدیل مسابقات واقعی ESPN به ساختار موتور کمّی و محاسبه خودکار امید گل (λ) از روی فرم واقعی دو تیم
  const liveMatches = [];
  for (const { league, data } of scoreResults) {
    if (!data?.events) continue;
    for (const ev of data.events) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!home || !away) continue;

      // محاسبه امتیاز فرم از روی ۵ بازی اخیر واقعی (مثلا WWDLW)
      const calcFormFactor = (formStr = 'WDLWD') => {
        const pts = formStr.split('').reduce((acc, ch) => acc + (ch === 'W' ? 3 : ch === 'D' ? 1 : 0), 0);
        return 0.78 + (pts / 15) * 0.48; // بازه 0.78 تا 1.26
      };

      const homeFormFactor = calcFormFactor(home.form);
      const awayFormFactor = calcFormFactor(away.form);
      const lambdaHome = Number(((league.avgGoals * 0.55) * homeFormFactor).toFixed(2));
      const lambdaAway = Number(((league.avgGoals * 0.45) * awayFormFactor).toFixed(2));

      liveMatches.push({
        id: ev.id,
        leagueSlug: league.slug,
        leagueName: league.name,
        homeTeam: home.team?.displayName || home.team?.name,
        awayTeam: away.team?.displayName || away.team?.name,
        homeLogo: home.team?.logo,
        awayLogo: away.team?.logo,
        homeForm: home.form || 'N/A',
        awayForm: away.form || 'N/A',
        kickoff: ev.date,
        statusDetail: ev.status?.type?.shortDetail || 'Scheduled',
        venue: comp.venue?.fullName || 'Stadium',
        lambdaHome,
        lambdaAway,
        isRealLiveApi: true
      });
    }
  }

  return { liveMatches, liveNews };
}
```

### ۳. رفع کامل باگ کاراکترهای شکسته (`ٱٱٱ`) در مودال «سبد تیپ‌های انتخابی» و افزودن نشانگر دیتای زنده

1. **اصلاح رشته متنی خروجی سبد تیپ‌های انتخابی (Cart Summary Text):**
   - در کامپوننت مودال «سبد تیپ‌های انتخابی» (گوشه پایین-چپ صفحه)، تابع تولیدکننده متن کپی/تلگرام را پیدا کن و تمام رشته‌های دارای کاراکترهای خراب (`ٱٱٱٱ`) را با متن فارسی استاندارد UTF-8 جایگزین کن:
     - سطر اول: `⚽ فوتبال‌کوانت v4.0 — سبد هوشمند تیپ‌های مکمل روزانه`
     - سطر دوم: `💰 کل بودجه روزانه: ${totalBudget} واحد | استراتژی: کلِی همزمان و داچینگ`
     - برای هر بازی در سبد:
       - `🏆 ${match.homeTeam} مقابل ${match.awayTeam} (${match.leagueName})`
       - `🔹 تیپ A (ضریب ${slipA.odds}): ${slipA.label} ⬅️ مبلغ شرط: ${slipA.stake} واحد`
       - `🟢 تیپ B مکمل (ضریب ${slipB.odds}): ${slipB.label} ⬅️ مبلغ شرط: ${slipB.stake} واحد`
       - `✅ سود خالص تضمینی: +${guaranteedProfit}% | ریسک باخت همزمان: ${jointLossRisk}%`
2. **نمایش بج سبز «🟢 متصل به فید زنده ESPN & TheSportsDB» در هدر و پنل اخبار زنده:**
   - در هدر بالای صفحه یک نشانگر زنده قرار بده که تعداد بازی‌های واقعی واکشی‌شده از سرور ESPN و زمان آخرین آپدیت شبکه را نشان دهد و یک دکمه `🔄 همگام‌سازی مجدد با سرورهای زنده` کنار آن بگذار.
   - یک بخش یا تب فرعی **«📰 رادار اخبار و مصدومیت‌های زنده (Live News & Injury Feed)»** اضافه کن که تیترهای واقعی دریافت‌شده از اندپوینت خبری ESPN را به همراه لینک مستقیم خبر و تاثیر آن بر مناظره ایجنت‌ها نمایش دهد.