import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";

export default async function StylistAttendancePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await db
    .select()
    .from(attendance)
    .where(eq(attendance.staffId, user.id))
    .orderBy(desc(attendance.date))
    .limit(30);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-xl text-ink">Your attendance</h1>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No attendance records yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{r.date}</p>
              <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-soft">
              <div>
                <dt className="uppercase tracking-wide2">Login</dt>
                <dd>{r.loginAt ? new Date(r.loginAt).toLocaleTimeString() : "—"}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide2">Check-in</dt>
                <dd>
                  {r.checkInAt ? new Date(r.checkInAt).toLocaleTimeString() : "—"}
                  {r.checkInAt && (r.checkInVerified ? " (verified)" : " (unverified)")}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide2">Check-out</dt>
                <dd>{r.checkOutAt ? new Date(r.checkOutAt).toLocaleTimeString() : "—"}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide2">Scheduled</dt>
                <dd>{r.scheduledStart ?? "—"}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
