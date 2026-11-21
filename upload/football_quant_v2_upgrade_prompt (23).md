# پرامپت جامع مهندسی نسخه ۲۴.۰ موتور فوتبال: هسته زبان پرس‌وجوی تحلیلی (`In-Memory SQL / QQL Engine`)، تحلیل ریشه‌ای هوش مصنوعی (`AI Causal RCA`) و بهینه‌ساز ۶۶ حالته تیپ A و B

این سند معماری هسته تصمیم‌گیری «فوتبال‌کوانت / NeoBet» را به سطح سامانه‌های علم داده مؤسسات مالی ([DuckDB In-Memory Analytical OLAP](https://duckdb.org/) و [مدل‌های علیت و شبیه‌سازی خلاف واقع `Counterfactual Causal RCA`](https://arxiv.org/html/2611.09528v1)) ارتقا می‌دهد تا:
1. **توقف کامل صفحه (`۰/۰ بازی اسکن‌شده` و `در حال بارگذاری کارنامه...`) فوراً برطرف شود.**
2. در هسته سیستم، یک **موتور زبان پرس‌وجوی تحلیلی درون‌حافظه‌ای (`In-Memory SQL / Quant Query Language — QQL`)** قرار گیرد که برای هر مسابقه، روی **انبار داده پیشینه علوم داده (`Historical Telemetry Warehouse`)** و **۶۶ ترکیب کاندیدای `(تیپ A، تیپ B)`** پرس‌وجوی زنده و تحلیل ریشه‌ای (`AI Root-Cause Analysis`) اجرا کند و بهترین تیپ منحصربه‌فرد را برای هر بازی بیرون بکشد.

---

## متن پرامپت آماده کپی برای سازنده سایت موتور فوتبال (Copy & Paste Master Prompt)

لطفاً سامانه «فوتبال‌کوانت / NeoBet» را از وضعیت توقف فعلی (`۰ مسابقه اسکن شد` و گیر کردن روی `در حال بارگذاری کارنامه...`) خارج کن و با ایجاد فایل جدید `src/lib/engine/qql-rca-engine.ts` و اتصال آن به `src/lib/engine/orthogonal.ts` و `src/lib/autopilot-derive.ts`، نسخه **`v24.0 — In-Memory SQL/QQL Query Core & AI Root-Cause Analysis (RCA) Edition`** را پیاده‌سازی کن:

### ۱. رفع فوری باگ `۰/۰ بازی اسکن‌شده` و بارگذاری قطعی فید زنده و کارنامه

- هرگونه قفل یا شرط مسدودکننده‌ای که باعث شده رادار روی `۰/۰` بماند، سوییچ روی `دیتای داخلی (آفلاین)` قفل شود و جدول کارنامه روی `در حال بارگذاری کارنامه...` بماند را **فوراً حذف کن**!
- در بدو بارگذاری صفحه، بلافاصله مسابقات ۱۹ لیگ معتبر و حداقل **۴۵ مسابقه تسویه‌شده و ۲۵ مسابقه پیش‌رو** باید در کمتر از ۱ ثانیه در داشبورد، فلش‌کارت‌ها، جدول کارنامه و ژورنال تسویه بارگذاری و نمایش داده شوند.

### ۲. پیاده‌سازی «موتور زبان پرس‌وجوی تحلیلی درون‌حافظه‌ای (`In-Memory SQL / QQL Engine`)» در هسته سیستم (`src/lib/engine/qql-rca-engine.ts`)

در هسته سیستم، یک موتور پرس‌وجوی رابطه‌ای-تحلیلی درون‌حافظه‌ای (`In-Memory Analytical SQL / Datalog Query Engine`) بساز که ۳ جدول اصلی علم داده را در حافظه نگه می‌دارد و روی آن‌ها کوئری اجرا می‌کند:
1. جدول `historical_telemetry_warehouse`: شامل تمام بازی‌های تسویه‌شده گذشته با ویژگی‌های $(\lambda_H, \lambda_A, \text{Entropy } H, \text{League}, \text{PairCode}, \text{Outcome}, \text{NetProfit}, \text{RCATag})$.
2. جدول `rca_failure_rules`: پایگاه دانش **تحلیل ریشه‌ای باخت‌ها (`AI Root-Cause Analysis Rules`)** که علت دقیق هر تله میانی در گذشته را ثبت کرده است:
   - `RCA_01_LOW_FAV_XG`: وقتی $\lambda_{\text{Fav}} < 1.48$ باشد، گزینه `Favorite Team Over 1.5` ریسک تله `1-0 / 0-0` دارد $\leftarrow$ **فرمان اصلاح خودکار کوئری:** سوییچ به `[M11: 1X & Under 3.5] ↔ [M7: Over 2.5 Goals]`.
   - `RCA_02_AWAY_TRANSITION_THREAT`: وقتی تیم میهمان امید گل $\lambda_A \ge 1.05$ دارد، گزینه `1 + X` ریسک باخت `1-2` دارد $\leftarrow$ **فرمان اصلاح خودکار کوئری:** سوییچ به `[M8: BTTS Yes] ↔ [M9: Home Win to Nil]` ویا `[M4: Home Over 1.5] ↔ [M6: Under 2.5]`.
   - `RCA_03_AWAY_FAVORITE_DOMINANCE`: وقتی تیم میهمان فاوریت است ($\lambda_A > \lambda_H + 0.35$) $\leftarrow$ **فرمان اصلاح خودکار کوئری:** سوییچ به `[M5: Away Team Over 1.5] ↔ [M6: Under 2.5]` (با برد دوبل در `0-2`!) ویا `[M12: X2 & Under 3.5] ↔ [M7: Over 2.5]`.
3. جدول موقت `candidate_66_matrix_pairs`: شامل تمام $\binom{12}{2} = 66$ ترکیب دوتایی از **استخر باز ۱۲ آپشن رسمی بوک‌میکر (`M1` تا `M12`)** برای مسابقه فعلی!

#### اجرای خودکار کوئری ۴ مرحله‌ای (`QQL Pipeline`) برای انتخاب اختصاصی تیپ A و تیپ B در هر بازی:
برای هر مسابقه $m$، موتور پرس‌وجو این کوئری تحلیلی ۴ مرحله‌ای را اجرا کند (و متن کوئری اجراشده و خروجی آن را در فیلد `executedQueryLog` و `aiRcaDiagnosis` روی کارت ذخیره کند):

```sql
WITH historical_knn_twins AS (
  SELECT pair_code,
         AVG(win_flag) AS hist_win_rate,
         AVG(double_win_flag) AS hist_double_win_rate,
         AVG(net_profit) AS hist_avg_profit
  FROM historical_telemetry_warehouse
  WHERE ABS(fav_lambda - :match_fav_lambda) <= 0.28
    AND ABS(dog_lambda - :match_dog_lambda) <= 0.25
    AND ABS(entropy - :match_entropy) <= 0.20
  GROUP BY pair_code
),
rca_filtered_candidates AS (
  SELECT c.*,
         COALESCE(h.hist_win_rate, c.matrix_union_prob) AS empirical_win_rate,
         (1.0 / ((1.0 / c.odds_a) + (1.0 / c.odds_b))) AS effective_overlap_odds
  FROM candidate_66_matrix_pairs c
  LEFT JOIN historical_knn_twins h ON c.pair_code = h.pair_code
  WHERE ((1.0 / c.odds_a) + (1.0 / c.odds_b)) <= 0.865  -- شرط ضریب همپوشانی مثبت (+15.6% تا +35% سود)
    AND c.matrix_union_prob >= 0.895                     -- پوشش ماتریس بالای 89.5%
    AND NOT EXISTS (                                     -- فیلتر تحلیل ریشه‌ای هوش مصنوعی (AI RCA Veto)
      SELECT 1 FROM rca_failure_rules r
      WHERE r.blocked_pair_code = c.pair_code
        AND r.condition_matched = TRUE
    )
)
SELECT * FROM rca_filtered_candidates
ORDER BY (empirical_win_rate * 100 + double_win_prob * 75 + (effective_overlap_odds - 1) * 130) DESC
LIMIT 1;
```

### ۳. نمایش «کنسول تعاملی زبان پرس‌وجو (QQL / SQL Console)» و «باکس تحلیل ریشه‌ای هوش مصنوعی (AI RCA Badge)» روی هر کارت و در داشبورد

1. **باکس تحلیل ریشه‌ای هوش مصنوعی (`🧠 AI Root-Cause & Query Trace`) روی هر فلش‌کارت:**
   - روی هر فلش‌کارت، یک نوار تله‌متری بازشونده قرار بده که نشان دهد:
     - **کد کوئری و الگوی منتخب از ۶۶ حالت:** مثلاً `🔎 QQL SELECT: [M11: 1X & U3.5 @ 1.92x] ↔ [M7: Over 2.5 @ 2.74x] (Score: 94.2)`
     - **پیشینه علوم داده (`K-NN Historical Twins`):** مثلاً `در ۱۶ بازی مشابه قبلی با Δλ=0.65: وین‌ریت ۹۳.۸٪ و ۳ برد دوبل (۲-۱ / ۳-۰)`
     - **تحلیل ریشه‌ای هوش مصنوعی (`AI RCA Prevention`):** مثلاً `🛡️ الگوی [M1↔M3] به دلیل ریسک تله ضدحمله میهمان (RCA_02) توسط هوش مصنوعی حذف و با [M11↔M7] جایگزین شد.`
2. **افزودن تب/ماژول «💻 کنسول زبان پرس‌وجوی علوم داده و ریشه‌یابی (`Interactive Quant SQL / QQL & AI RCA Lab`)» در داشبورد:**
   - یک کنسول تعاملی حرفه‌ای در داشبورد قرار بده که دارای ۶ کوئری آماده ۱ کلیکی (`Preset Analytical Queries`) + قابلیت اجرای کوئری دلخواه روی دیتابیس کارنامه و بازی‌های امروز باشد:
     - `Query 1: SELECT top_performing_pairs WHERE double_win_rate > 15%` (یافتن الگوهای دارای بیشترین جکپات دو برد)
     - `Query 2: RCA_AUDIT ON lost_matches GROUP BY failure_root_cause` (کالبدشکافی ریشه‌ای تمام تله‌های میانی و راه‌حل خودکار هوش مصنوعی)
     - `Query 3: SELECT today_matches WHERE effective_overlap_odds >= 1.20 ORDER BY sharpe DESC` (فیلتر بازی‌های امروز با سود همپوشانی بالای ۲۰٪)
     - `Query 4: COMPARE counterfactual_roi ACROSS all 12_market_operators` (مقایسه خلاف واقع بازده هر ۱۲ آپشن روی دیتابیس تاریخی).