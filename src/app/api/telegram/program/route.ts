import { NextRequest, NextResponse } from "next/server";
import { getDailyProgramStatus, sendMorningProgramBoard, sendTomorrowPreview } from "@/lib/server/daily-program";
import { getSetting } from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DaemonHealth {
  alive: boolean;
  cycles: number;
  lastCycleAt: string | null;
  lastError: string | null;
}

/** پینگ دیمن پخش :3011 — قلب مستقل از مرورگر سیستم */
async function daemonHealth(): Promise<DaemonHealth> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("http://127.0.0.1:3011/health", { signal: controller.signal, cache: "no-store" });
    clearTimeout(t);
    const json = (await res.json()) as { state?: { cycles?: number; lastCycleAt?: string; lastError?: string | null } };
    return {
      alive: res.ok,
      cycles: json.state?.cycles ?? 0,
      lastCycleAt: json.state?.lastCycleAt ?? null,
      lastError: json.state?.lastError ?? null,
    };
  } catch {
    return { alive: false, cycles: 0, lastCycleAt: null, lastError: "unreachable" };
  }
}

/**
 * GET /api/telegram/program — وضعیت زنده «برنامه روزانه حرفه‌ای پخش» (v21.0):
 *   · جدول ۱۱ اسلات رسمی با ساعت دقیق تهران + وضعیت هر اسلات (SENT/DUE/UPCOMING)
 *   · شمارنده‌های واقعی: بازی‌های امروز، کارت‌های آماده امروز/فردا، نتایج در صف
 *   · سلامت هسته مستقل از مرورگر: دیمن پخش :3011 + تیک زمان‌بند سرور
 * POST /api/telegram/program — اجرای دستی اسلات:
 *   { slot: "morning" }  → تابلوی برنامه صبح → هر دو کانال
 *   { slot: "tomorrow" } → پیش‌نمایش کارت‌های فردا → VIP کامل + تابلوی عمومی
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [program, daemon, schedulerTick] = await Promise.all([
      getDailyProgramStatus(),
      daemonHealth(),
      getSetting("scheduler_last_tick").catch(() => null),
    ]);
    return NextResponse.json({
      success: true,
      program,
      health: {
        daemon,
        schedulerLastTick: schedulerTick,
        browserIndependent: true,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "program status failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as { slot?: string };
    if (body.slot === "morning") {
      const r = await sendMorningProgramBoard(true);
      return NextResponse.json({ success: r.ok, slot: "morning", detail: r.detail });
    }
    if (body.slot === "tomorrow") {
      const r = await sendTomorrowPreview(true);
      return NextResponse.json({ success: r.ok, slot: "tomorrow", detail: r.detail, sent: r.sent, listed: r.listed });
    }
    return NextResponse.json({ success: false, error: "unknown slot — use morning | tomorrow" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "program slot failed" },
      { status: 500 }
    );
  }
}
