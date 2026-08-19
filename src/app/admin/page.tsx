import { db } from "@/db";
import { appointments, users, attendance, completedWork, payments, services } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide2 text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-2xl text-ink">{value}</p>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const date = today();

  const todaysAppointments = await db
    .select({ appointment: appointments, serviceName: services.name })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(eq(appointments.scheduledDate, date));

  const stylists = await db.select().from(users).where(eq(users.role, "stylist"));
  const todaysAttendance = await db.select().from(attendance).where(eq(attendance.date, date));

  const revenueRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .innerJoin(appointments, eq(payments.appointmentId, appointments.id))
    .where(and(eq(appointments.scheduledDate, date), eq(payments.status, "paid")));
  const revenueToday = revenueRows.reduce((sum, r) => sum + r.amount, 0);

  const waiting = todaysAppointments.filter((a) => ["arrived", "confirmed", "pending"].includes(a.appointment.status));
  const inService = todaysAppointments.filter((a) => a.appointment.status === "in_service");
  const cancelledToday = todaysAppointments.filter((a) => a.appointment.status === "cancelled").length;
  const noShowToday = todaysAppointments.filter((a) => a.appointment.status === "no_show").length;

  const pendingReviewWork = await db.select().from(completedWork).where(eq(completedWork.reviewStatus, "pending_review"));

  const staffPresent = todaysAttendance.filter((a) => a.checkInAt).length;

  const alerts: { label: string; tone: "warning" | "danger" }[] = [];
  const staffNotCheckedIn = stylists.filter(
    (s) => !todaysAttendance.some((a) => a.staffId === s.id && a.checkInAt)
  );
  if (staffNotCheckedIn.length > 0) {
    alerts.push({ label: `${staffNotCheckedIn.length} stylist(s) not checked in yet`, tone: "warning" });
  }
  if (waiting.filter((a) => a.appointment.status === "arrived").length > 0) {
    alerts.push({ label: `${waiting.filter((a) => a.appointment.status === "arrived").length} customer(s) waiting`, tone: "warning" });
  }
  if (pendingReviewWork.length > 0) {
    alerts.push({ label: `${pendingReviewWork.length} completed service(s) awaiting review`, tone: "warning" });
  }
  if (cancelledToday > 0) {
    alerts.push({ label: `${cancelledToday} cancellation(s) today`, tone: "danger" });
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Today at Hairtopia</h1>
      <p className="mt-1 text-sm text-ink-soft">{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Appointments today" value={todaysAppointments.length} />
        <Stat label="Revenue today" value={`GH₵${revenueToday.toFixed(0)}`} />
        <Stat label="Staff present" value={`${staffPresent}/${stylists.length}`} />
        <Stat label="Waiting now" value={waiting.length} />
        <Stat label="In service" value={inService.length} />
        <Stat label="Cancellations" value={cancelledToday} />
        <Stat label="No-shows" value={noShowToday} />
        <Stat label="Pending reviews" value={pendingReviewWork.length} />
      </div>

      {alerts.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-display text-lg text-ink">Needs attention</h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-card border border-line bg-surface px-4 py-3">
                <Badge tone={a.tone}>{a.label}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Staff status</h2>
          {stylists.length === 0 ? (
            <EmptyState title="No stylists added yet" description="Add stylists from the Staff page." />
          ) : (
            <div className="space-y-2">
              {stylists.map((s) => {
                const a = todaysAttendance.find((r) => r.staffId === s.id);
                const busy = todaysAppointments.find(
                  (r) => r.appointment.stylistId === s.id && r.appointment.status === "in_service"
                );
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
                    <span className="text-sm text-ink">{s.name}</span>
                    {busy ? (
                      <Badge tone="warning">In service — {busy.appointment.customerName}</Badge>
                    ) : a?.checkInAt ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="neutral">Not checked in</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Customers today</h2>
          {todaysAppointments.length === 0 ? (
            <EmptyState title="No appointments yet" description="Everything is quiet so far today." />
          ) : (
            <div className="space-y-2">
              {todaysAppointments
                .sort((a, b) => a.appointment.scheduledTime.localeCompare(b.appointment.scheduledTime))
                .map(({ appointment, serviceName }) => (
                  <div key={appointment.id} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
                    <div>
                      <p className="text-sm text-ink">{appointment.customerName}</p>
                      <p className="text-xs text-ink-soft">{serviceName} · {appointment.scheduledTime}</p>
                    </div>
                    <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
