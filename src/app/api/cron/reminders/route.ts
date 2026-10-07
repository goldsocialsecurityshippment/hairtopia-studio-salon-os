import { NextRequest, NextResponse } from "next/server";
import { runScheduledReminders } from "@/lib/reminders";

/**
 * Secured endpoint a deployment scheduler (Vercel Cron, a server crontab
 * hitting this URL with curl, GitHub Actions on a schedule, etc.) calls
 * periodically — every 15–30 minutes is reasonable. See the README's
 * "Scheduled jobs" section for exact setup.
 *
 * SECURITY: this is NOT an open endpoint. It requires CRON_SECRET to be
 * set and passed back as a Bearer token — without a correct match it
 * refuses the request. There is deliberately no fallback "if unset, allow
 * anyway" — an unconfigured secret means the endpoint is closed, not open.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Scheduled jobs are not configured (CRON_SECRET unset)." }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await runScheduledReminders();
  return NextResponse.json({ ok: true, ...results });
}

// Some schedulers (e.g. simple GET-based uptime-style pingers) only send
// GET — support the same auth/behavior there too rather than forcing POST.
export async function GET(req: NextRequest) {
  return POST(req);
}
