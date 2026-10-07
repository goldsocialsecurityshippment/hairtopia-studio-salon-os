import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { appointments, services, attendance } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { StylistAppointmentCard } from "@/components/stylist/StylistAppointmentCard";
import { AttendanceActions } from "@/components/stylist/AttendanceActions";
import { EmptyState } from "@/components/ui/EmptyState";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StylistTodayPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const date = today();

  const rows = await db
    .select({ appointment: appointments, serviceName: services.name })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(and(eq(appointments.stylistId, user.id), eq(appointments.scheduledDate, date)));

  const [attendanceRow] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.staffId, user.id), eq(attendance.date, date)));

  const sorted = rows.sort((a, b) => a.appointment.scheduledTime.localeCompare(b.appointment.scheduledTime));
  const active = sorted.filter((r) => ["in_service"].includes(r.appointment.status));
  const waiting = sorted.filter((r) => ["arrived", "confirmed", "pending"].includes(r.appointment.status));
  const done = sorted.filter((r) => ["completed", "cancelled", "no_show"].includes(r.appointment.status));

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <section className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wide2 text-ink-soft">Attendance today</p>
        <div className="mt-2">
          <AttendanceActions
            hasCheckedIn={!!attendanceRow?.checkInAt}
            hasCheckedOut={!!attendanceRow?.checkOutAt}
          />
        </div>
      </section>

      {active.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Currently with you</h2>
          <div className="space-y-3">
            {active.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{ ...appointment, serviceName }}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Today&apos;s appointments</h2>
        {waiting.length === 0 ? (
          <EmptyState title="Your schedule is clear." description="No more appointments waiting today." />
        ) : (
          <div className="space-y-3">
            {waiting.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{ ...appointment, serviceName }}
              />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">Completed today</h2>
          <div className="space-y-3">
            {done.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{ ...appointment, serviceName }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
