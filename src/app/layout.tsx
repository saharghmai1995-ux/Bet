import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/app/theme-provider";

export const metadata: Metadata = {
  title: "فوتبال‌کوانت | سیستم هوشمند پیش‌بینی و مدیریت سرمایه",
  description:
    "معماری چندایجنتی پیش‌بینی فوتبال: موتور دیکسون-کولز، ایجنت تحلیلگر ارشد، ایجنت مدیریت ریسک و داچینگ، بک‌تستینگ CLV",
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
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className="antialiased bg-background text-foreground font-vazir">
        <ThemeProvider>
          {children}
          <Toaster richColors position="bottom-left" />
        </ThemeProvider>
      </body>
    </html>
  );
}
