import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "NEOBET QUANT PRO • @AINEOBET | v24.0 Quantum Annealing 12×12 + QQL/RCA Engine",
  description:
    "حل‌کننده کوانتومی ترکیب ۱۲ آپشن × ۶۶ جفت v23.0 (انتخاب اختصاصی هر بازی با تابع انرژی U و قید همپوشانی مثبت ۰.۸۶۵) + موتور زبان پرس‌وجوی تحلیلی درون‌حافظه‌ای و تحلیل ریشه‌ای هوش مصنوعی v24.0 (K-NN twins + وتوی RCA_01/02/03) + سه الگوی طلایی G1/G2/G3 + تخصیص نامتقارن ۶۵/۳۵ + خط لوله ESPN · TheSportsDB · Polymarket + تسویه خودکار ESPN + کانال تلگرام VIP",
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
