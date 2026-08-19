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

const ACTIVE_STATUSES = ["pending", "confirmed", "arrived", "in_service"];

export default async function StylistTodayPage() {
  const user = await getCurrentUser();

  if (!user) return null;

  const date = today();

  // Load all appointments assigned to this stylist.
  const rows = await db
    .select({
      appointment: appointments,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(eq(appointments.stylistId, user.id));

  const [attendanceRow] = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.staffId, user.id),
        eq(attendance.date, date)
      )
    );

  const sorted = rows.sort((a, b) => {
    const dateCompare =
      a.appointment.scheduledDate.localeCompare(
        b.appointment.scheduledDate
      );

    if (dateCompare !== 0) return dateCompare;

    return a.appointment.scheduledTime.localeCompare(
      b.appointment.scheduledTime
    );
  });

  // Today's appointments currently being worked on.
  const active = sorted.filter(
    ({ appointment }) =>
      appointment.scheduledDate === date &&
      appointment.status === "in_service"
  );

  // Today's waiting appointments.
  const waiting = sorted.filter(
    ({ appointment }) =>
      appointment.scheduledDate === date &&
      ["arrived", "confirmed", "pending"].includes(
        appointment.status
      )
  );

  // Today's completed/cancelled/no-show appointments.
  const done = sorted.filter(
    ({ appointment }) =>
      appointment.scheduledDate === date &&
      ["completed", "cancelled", "no_show"].includes(
        appointment.status
      )
  );

  // Future appointments assigned to this stylist.
  const upcoming = sorted.filter(
    ({ appointment }) =>
      appointment.scheduledDate > date &&
      ACTIVE_STATUSES.includes(appointment.status)
  );

  return (
    <div className="mx-auto max-w-lg space-y-8">

      {/* ATTENDANCE */}

      <section className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wide2 text-ink-soft">
          Attendance today
        </p>

        <div className="mt-2">
          <AttendanceActions
            hasCheckedIn={!!attendanceRow?.checkInAt}
            hasCheckedOut={!!attendanceRow?.checkOutAt}
          />
        </div>
      </section>

      {/* CURRENTLY WITH STYLIST */}

      {active.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">
            Currently with you
          </h2>

          <div className="space-y-3">
            {active.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{
                  ...appointment,
                  serviceName,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* TODAY */}

      <section>
        <h2 className="mb-3 font-display text-lg text-ink">
          Today&apos;s appointments
        </h2>

        {waiting.length === 0 ? (
          <EmptyState
            title="Your schedule is clear."
            description="No more appointments waiting today."
          />
        ) : (
          <div className="space-y-3">
            {waiting.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{
                  ...appointment,
                  serviceName,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* UPCOMING */}

      <section>
        <div className="mb-3">
          <h2 className="font-display text-lg text-ink">
            Upcoming appointments
          </h2>

          <p className="text-xs text-ink-soft">
            Future bookings assigned to you
          </p>
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming appointments."
            description="New bookings assigned to you will appear here."
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{
                  ...appointment,
                  serviceName,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* COMPLETED TODAY */}

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg text-ink">
            Completed today
          </h2>

          <div className="space-y-3">
            {done.map(({ appointment, serviceName }) => (
              <StylistAppointmentCard
                key={appointment.id}
                appt={{
                  ...appointment,
                  serviceName,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}