import { db } from "@/db";
import { appointments, payments, users, reviews, attendance, services } from "@/db/schema";
import { eq, gte, avg, count } from "drizzle-orm";
import { Card } from "@/components/ui/Card";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const PERIODS = {
  today: { label: "Today", from: () => startOfToday() },
  week: { label: "This week", from: () => daysAgo(7) },
  month: { label: "This month", from: () => daysAgo(30) },
  year: { label: "This year", from: () => daysAgo(365) },
  all: { label: "All time", from: () => new Date(0) },
} as const;

type PeriodKey = keyof typeof PERIODS;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const periodKey: PeriodKey = period && period in PERIODS ? (period as PeriodKey) : "month";
  const fromDate = PERIODS[periodKey].from();
  const since = fromDate.toISOString().slice(0, 10);

  const periodAppointments = await db
    .select({ appointment: appointments, serviceName: services.name })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(gte(appointments.scheduledDate, since));

  const allPayments = await db.select().from(payments).where(eq(payments.status, "paid"));
  const periodPayments = allPayments.filter((p) => new Date(p.timestamp) >= fromDate);
  const periodRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0);

  const completed = periodAppointments.filter((a) => a.appointment.status === "completed").length;
  const cancelled = periodAppointments.filter((a) => a.appointment.status === "cancelled").length;
  const noShow = periodAppointments.filter((a) => a.appointment.status === "no_show").length;
  const walkins = periodAppointments.filter((a) => a.appointment.source !== "online").length;

  const serviceCounts = new Map<string, number>();
  periodAppointments.forEach((a) => {
    serviceCounts.set(a.serviceName, (serviceCounts.get(a.serviceName) ?? 0) + 1);
  });
  const popularServices = Array.from(serviceCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const stylists = await db.select().from(users).where(eq(users.role, "stylist"));
  const stylistRatings = await db
    .select({ stylistId: appointments.stylistId, avgRating: avg(reviews.overallRating), reviewCount: count(reviews.id) })
    .from(reviews)
    .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
    .groupBy(appointments.stylistId);

  const attendanceRows = await db.select().from(attendance).where(gte(attendance.date, since));

  // Revenue by stylist for this period, since payments aren't directly linked to a stylist column —
  // join through the appointment.
  const apptById = new Map(periodAppointments.map((a) => [a.appointment.id, a.appointment]));
  const revenueByStylist = new Map<string, number>();
  for (const p of periodPayments) {
    const appt = apptById.get(p.appointmentId);
    if (appt?.stylistId) {
      revenueByStylist.set(appt.stylistId, (revenueByStylist.get(appt.stylistId) ?? 0) + p.amount);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Reports</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(PERIODS) as PeriodKey[]).map((key) => (
          <a
            key={key}
            href={`/admin/reports?period=${key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              periodKey === key ? "bg-ink text-canvas" : "bg-ink/5 text-ink-soft"
            }`}
          >
            {PERIODS[key].label}
          </a>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Revenue ({PERIODS[periodKey].label.toLowerCase()})</p><p className="mt-2 font-display text-2xl text-ink">GH₵{periodRevenue.toFixed(0)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Completed</p><p className="mt-2 font-display text-2xl text-ink">{completed}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Cancellations</p><p className="mt-2 font-display text-2xl text-ink">{cancelled}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">No-shows</p><p className="mt-2 font-display text-2xl text-ink">{noShow}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Walk-ins</p><p className="mt-2 font-display text-2xl text-ink">{walkins}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Total appointments</p><p className="mt-2 font-display text-2xl text-ink">{periodAppointments.length}</p></Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Popular services</h2>
          <div className="space-y-2">
            {popularServices.map(([name, n]) => (
              <div key={name} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3 text-sm">
                <span className="text-ink">{name}</span>
                <span className="text-ink-soft">{n} bookings</span>
              </div>
            ))}
            {popularServices.length === 0 && <p className="text-sm text-ink-soft">No data yet.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Stylist performance</h2>
          <div className="space-y-2">
            {stylists.map((s) => {
              const rating = stylistRatings.find((r) => r.stylistId === s.id);
              const attend = attendanceRows.filter((a) => a.staffId === s.id);
              const lateCount = attend.filter((a) => a.status === "late").length;
              const revenue = revenueByStylist.get(s.id) ?? 0;
              return (
                <div key={s.id} className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-ink-soft">
                      {rating?.avgRating ? `★ ${Number(rating.avgRating).toFixed(1)}` : "No ratings yet"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    GH₵{revenue.toFixed(0)} revenue · {rating?.reviewCount ?? 0} reviews · {lateCount} late
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
