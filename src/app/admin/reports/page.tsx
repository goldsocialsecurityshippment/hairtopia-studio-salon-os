import { db } from "@/db";
import { appointments, payments, users, reviews, attendance, services, consultations } from "@/db/schema";
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

  // Unique clients vs appointments — a client booked 5 times counts once here,
  // never as 5. New vs returning is derived from whether this is their first
  // ever appointment (across all time, not just this period).
  const clientIdsThisPeriod = new Set(periodAppointments.map((a) => a.appointment.clientId).filter(Boolean));
  const allAppointmentsEver = await db.select({ clientId: appointments.clientId, scheduledDate: appointments.scheduledDate }).from(appointments);
  const firstVisitByClient = new Map<string, string>();
  for (const a of allAppointmentsEver) {
    if (!a.clientId) continue;
    const existing = firstVisitByClient.get(a.clientId);
    if (!existing || a.scheduledDate < existing) firstVisitByClient.set(a.clientId, a.scheduledDate);
  }
  const newClientsThisPeriod = Array.from(clientIdsThisPeriod).filter(
    (id) => id && firstVisitByClient.get(id) && firstVisitByClient.get(id)! >= since
  ).length;
  const returningClientsThisPeriod = clientIdsThisPeriod.size - newClientsThisPeriod;

  const depositsCollected = periodPayments.filter((p) => p.paymentType === "deposit").reduce((s, p) => s + p.amount, 0);
  const outstandingBalance = periodAppointments.reduce((s, a) => s + (a.appointment.balanceDue || 0), 0);
  const paymentsByMethod = new Map<string, number>();
  periodPayments.forEach((p) => paymentsByMethod.set(p.method, (paymentsByMethod.get(p.method) ?? 0) + p.amount));

  const { inventoryItems } = await import("@/db/schema");
  const lowStockCount = (await db.select().from(inventoryItems)).filter((i) => i.active && i.quantity <= i.minThreshold).length;

  const allConsultations = await db.select().from(consultations);
  const periodConsultations = allConsultations.filter((c) => new Date(c.createdAt) >= fromDate);
  const consultationsCompleted = periodConsultations.filter((c) => c.status === "completed").length;
  const consultationsDeclined = periodConsultations.filter((c) => c.status === "declined").length;
  const consultationsConverted = periodConsultations.filter((c) => c.status === "converted").length;

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
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Unique clients</p><p className="mt-2 font-display text-2xl text-ink">{clientIdsThisPeriod.size}</p><p className="mt-1 text-xs text-ink-soft">{newClientsThisPeriod} new · {returningClientsThisPeriod} returning</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Deposits collected</p><p className="mt-2 font-display text-2xl text-ink">GH₵{depositsCollected.toFixed(0)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Outstanding balance</p><p className="mt-2 font-display text-2xl text-ink">GH₵{outstandingBalance.toFixed(0)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide2 text-ink-soft">Low stock items</p><p className="mt-2 font-display text-2xl text-ink">{lowStockCount}</p></Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink">Consultations</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-ink-soft">Total requests</p><p className="mt-1 font-display text-lg text-ink">{periodConsultations.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-soft">Completed</p><p className="mt-1 font-display text-lg text-ink">{consultationsCompleted}</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-soft">Converted to booking</p><p className="mt-1 font-display text-lg text-ink">{consultationsConverted}</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-soft">Declined</p><p className="mt-1 font-display text-lg text-ink">{consultationsDeclined}</p></Card>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink">Payments by method</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {["cash", "mobile_money", "card", "bank_transfer"].map((m) => (
            <Card key={m} className="p-4">
              <p className="text-xs capitalize text-ink-soft">{m.replace("_", " ")}</p>
              <p className="mt-1 font-display text-lg text-ink">GH₵{(paymentsByMethod.get(m) ?? 0).toFixed(0)}</p>
            </Card>
          ))}
        </div>
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
              const stylistAppointments = periodAppointments.filter((a) => a.appointment.stylistId === s.id);
              const uniqueClientsServed = new Set(stylistAppointments.map((a) => a.appointment.clientId).filter(Boolean)).size;
              return (
                <div key={s.id} className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-ink-soft">
                      {rating?.avgRating ? `★ ${Number(rating.avgRating).toFixed(1)}` : "No ratings yet"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    GH₵{revenue.toFixed(0)} revenue · {stylistAppointments.length} appointments · {uniqueClientsServed} unique clients · {rating?.reviewCount ?? 0} reviews · {lateCount} late
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
