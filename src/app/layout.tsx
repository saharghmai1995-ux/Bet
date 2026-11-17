import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "NEOBET QUANT PRO • @AINEOBET | v19.0 Restore — Orthogonal Dual-Hedge + Strict Positive Overlap Filter",
  description:
    "بازگشت به معماری برنده همپوشانی دوقلو v19.0 (۳ الگوی طلایی G1/G2/G3 با ناحیه برد دوبل) + فیلتر طلایی ضریب همپوشانی مثبت (impliedSum ≤ ۰.۸۶ · حاشیه ≥ ۱۵٪ · برد دوبل ≥ ۱۲٪ · ریسک تله ≤ ۱۱.۵٪) + تخصیص نامتقارن ۶۵/۳۵ + سپر استاپ‌لاس دقیقه ۶۵ + خط لوله ترکیبی ESPN · TheSportsDB · Polymarket · Hybrid Poisson + تسویه خودکار ESPN + کانال تلگرام VIP",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // تم ثابت Obsidian Carbon — نسخه ۲.۰ همیشه تیره است
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className="antialiased bg-background text-foreground font-vazir">
        {children}
        <Toaster richColors position="bottom-left" theme="dark" />
      </body>
    </html>
  );
}
