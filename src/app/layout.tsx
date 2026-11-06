import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "فوتبال‌کوانت ۲.۰ | موتور کمّی نهادی و نسخه تاکتیکی سه‌بعدی",
  description:
    "معماری چندایجنتی سطح نهادی: دیکسون-کولز، حذف حاشیه شین، مناظره گاو و خرس، پرتفوی مونت‌کارلو کاپولا، کلِی همزمان و بک‌تست CLV",
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
