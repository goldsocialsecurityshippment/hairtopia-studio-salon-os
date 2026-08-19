import { db } from "@/db";
import {
  appointments,
  services,
  users,
  completedWork,
  payments,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "arrived",
  "in_service",
];

const ALL_STATUSES = [
  "pending",
  "confirmed",
  "arrived",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
];

function AppointmentTable({
  rows,
  stylists,
  work,
  allPayments,
}: {
  rows: {
    appointment: typeof appointments.$inferSelect;
    serviceName: string;
  }[];
  stylists: typeof users.$inferSelect[];
  work: typeof completedWork.$inferSelect[];
  allPayments: typeof payments.$inferSelect[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No appointments"
        description="There are no appointments in this section."
      />
    );
  }

  return (
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
            {rows.map(({ appointment, serviceName }) => {
              const stylist = stylists.find(
                (s) => s.id === appointment.stylistId
              );

              const workCount = work.filter(
                (w) => w.appointmentId === appointment.id
              ).length;

              const paidAmount = allPayments
                .filter(
                  (p) =>
                    p.appointmentId === appointment.id &&
                    p.status === "paid"
                )
                .reduce((sum, p) => sum + p.amount, 0);

              return (
                <tr
                  key={appointment.id}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-4 py-3">
                    <p className="text-ink">
                      {appointment.customerName}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {appointment.customerPhone}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-ink-soft">
                    {serviceName}
                  </td>

                  <td className="px-4 py-3 text-ink-soft">
                    {stylist?.name ?? "Unassigned"}
                  </td>

                  <td className="px-4 py-3 text-ink-soft">
                    {appointment.scheduledDate}{" "}
                    {appointment.scheduledTime}
                  </td>

                  <td className="px-4 py-3">
                    <Badge tone={statusTone(appointment.status)}>
                      {statusLabel(appointment.status)}
                    </Badge>
                  </td>

                  <td className="px-4 py-3">
                    <Badge tone={statusTone(appointment.paymentStatus)}>
                      {statusLabel(appointment.paymentStatus)}
                    </Badge>

                    {paidAmount > 0 && (
                      <p className="mt-1 text-xs text-ink-soft">
                        GH₵{paidAmount}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 text-ink-soft">
                    {workCount > 0
                      ? `${workCount} file(s)`
                      : "—"}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/appointments/${appointment.id}`}
                      className="text-xs font-medium text-bronze-500 hover:underline"
                    >
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
  );
}

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const rows = await db
    .select({
      appointment: appointments,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(
      services,
      eq(appointments.serviceId, services.id)
    )
    .orderBy(
      desc(appointments.scheduledDate),
      desc(appointments.scheduledTime)
    )
    .limit(500);

  const stylists = await db
    .select()
    .from(users)
    .where(eq(users.role, "stylist"));

  const work = await db.select().from(completedWork);
  const allPayments = await db.select().from(payments);

  const date = today();

  const filtered = status
    ? rows.filter((r) => r.appointment.status === status)
    : rows;

  /*
   * TODAY
   */
  const todayAppointments = filtered.filter(
    ({ appointment }) =>
      appointment.scheduledDate === date
  );

  /*
   * UPCOMING
   *
   * Future dates only.
   * Cancelled/no-show appointments are excluded.
   */
  const upcomingAppointments = filtered.filter(
    ({ appointment }) =>
      appointment.scheduledDate > date &&
      ACTIVE_STATUSES.includes(
        appointment.status as (typeof ACTIVE_STATUSES)[number]
      )
  );

  /*
   * PAST
   */
  const pastAppointments = filtered.filter(
    ({ appointment }) =>
      appointment.scheduledDate < date ||
      (
        appointment.scheduledDate === date &&
        ["completed", "cancelled", "no_show"].includes(
          appointment.status
        )
      )
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl text-ink">
          Appointments
        </h1>

        <p className="mt-1 text-sm text-ink-soft">
          Manage today&apos;s, upcoming and past salon appointments.
        </p>
      </div>

      {/* STATUS FILTERS */}

      <div className="flex flex-wrap gap-2">
        <a
          href="/admin/appointments"
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            !status
              ? "bg-ink text-canvas"
              : "bg-ink/5 text-ink-soft"
          }`}
        >
          All
        </a>

        {ALL_STATUSES.map((s) => (
          <a
            key={s}
            href={`/admin/appointments?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              status === s
                ? "bg-ink text-canvas"
                : "bg-ink/5 text-ink-soft"
            }`}
          >
            {statusLabel(s)}
          </a>
        ))}
      </div>

      {/* TODAY */}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-ink">
              Today&apos;s Appointments
            </h2>

            <p className="text-xs text-ink-soft">
              {date}
            </p>
          </div>

          <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink-soft">
            {todayAppointments.length} appointment
            {todayAppointments.length === 1 ? "" : "s"}
          </span>
        </div>

        <AppointmentTable
          rows={todayAppointments}
          stylists={stylists}
          work={work}
          allPayments={allPayments}
        />
      </section>

      {/* UPCOMING */}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-ink">
              Upcoming Appointments
            </h2>

            <p className="text-xs text-ink-soft">
              Future confirmed bookings across all stylists
            </p>
          </div>

          <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink-soft">
            {upcomingAppointments.length} appointment
            {upcomingAppointments.length === 1 ? "" : "s"}
          </span>
        </div>

        <AppointmentTable
          rows={upcomingAppointments}
          stylists={stylists}
          work={work}
          allPayments={allPayments}
        />
      </section>

      {/* PAST */}

      {pastAppointments.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="font-display text-xl text-ink">
              Past Appointments
            </h2>

            <p className="text-xs text-ink-soft">
              Completed, cancelled and no-show appointments
            </p>
          </div>

          <AppointmentTable
            rows={pastAppointments}
            stylists={stylists}
            work={work}
            allPayments={allPayments}
          />
        </section>
      )}
    </div>
  );
}