import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "NEOBET QUANT PRO • @AINEOBET | v22.0 100% Automated Live Odds — ۱۰۰٪ ESPN Verified",
  description:
    "حسابداری صادقانه بدون فیک (Zero-Fake Accounting) + تسویه درست میزبان/میهمان + حلقه کالیبراسیون خودکار دسته‌ها + مسیریاب غیرخطی ۵ رژیمی Bet-Type (بنکر، کمبوی رسمی، خوشه نتیجه دقیق، زوج‌تیپ، آکومولاتور) + دیتای زنده واقعی ESPN، تسویه خودکار FT، کانال تلگرام VIP، مناظره گاو/خرس، کلِی همزمان و پوشش زنده",
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
