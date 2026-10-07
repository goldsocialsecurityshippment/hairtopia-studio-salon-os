import { db } from "@/db";
import { appointments, services, users, completedWork, payments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const rows = await db
    .select({ appointment: appointments, serviceName: services.name })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .orderBy(desc(appointments.createdAt))
    .limit(200);

  const stylists = await db.select().from(users).where(eq(users.role, "stylist"));
  const work = await db.select().from(completedWork);
  const allPayments = await db.select().from(payments);

  const filtered = status ? rows.filter((r) => r.appointment.status === status) : rows;

  const statuses = ["pending", "confirmed", "arrived", "in_service", "completed", "cancelled", "no_show"];

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Appointments</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="/admin/appointments"
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${!status ? "bg-ink text-canvas" : "bg-ink/5 text-ink-soft"}`}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/admin/appointments?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${status === s ? "bg-ink text-canvas" : "bg-ink/5 text-ink-soft"}`}
          >
            {statusLabel(s)}
          </a>
        ))}
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState title="No appointments found" description="Try a different filter." />
        ) : (
          <div className="rounded-card border border-line bg-surface">
            <p className="border-b border-line px-4 py-2 text-xs text-ink-soft sm:hidden">
              Swipe the table sideways to see status, payment and work review →
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas/50 text-xs uppercase tracking-wide2 text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Stylist</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Work</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ appointment, serviceName }) => {
                  const stylist = stylists.find((s) => s.id === appointment.stylistId);
                  const workCount = work.filter((w) => w.appointmentId === appointment.id).length;
                  const paidAmount = allPayments
                    .filter((p) => p.appointmentId === appointment.id && p.status === "paid")
                    .reduce((sum, p) => sum + p.amount, 0);
                  return (
                    <tr key={appointment.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-ink">{appointment.customerName}</p>
                        <p className="text-xs text-ink-soft">{appointment.customerPhone}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{serviceName}</td>
                      <td className="px-4 py-3 text-ink-soft">{stylist?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-soft">{appointment.scheduledDate} {appointment.scheduledTime}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge></td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(appointment.paymentStatus)}>{statusLabel(appointment.paymentStatus)}</Badge>
                        {paidAmount > 0 && <p className="mt-1 text-xs text-ink-soft">GH₵{paidAmount}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{workCount > 0 ? `${workCount} file(s)` : "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/appointments/${appointment.id}`} className="text-xs font-medium text-bronze-500 hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
