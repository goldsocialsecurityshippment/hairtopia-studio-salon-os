import { db } from "@/db";
import { appointments, notifications } from "@/db/schema";
import { eq, and, inArray, lte } from "drizzle-orm";
import { notify } from "@/lib/notify";

/**
 * Meant to be called by a deployment scheduler (cron / Vercel Cron / etc.)
 * roughly every 15–30 minutes — see the secured route at
 * /api/cron/reminders and the README's "Scheduled jobs" section for how to
 * configure it. Every reminder here is deduplicated against the
 * `notifications` table itself (type + relatedAppointmentId), so calling
 * this function repeatedly, or on overlapping schedules, never sends the
 * same reminder twice for the same appointment.
 */
export async function runScheduledReminders() {
  const results = { appointmentReminders: 0, depositReminders: 0 };

  // --- Appointment reminders: appointments 20–28 hours out (a ~24h-ahead
  // reminder with a window wide enough to tolerate the scheduler not
  // running at the exact minute) that are still pending/confirmed. ---
  const now = new Date();
  const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);

  const upcoming = await db
    .select()
    .from(appointments)
    .where(inArray(appointments.status, ["pending", "confirmed"]));

  for (const appt of upcoming) {
    const apptDateTime = new Date(`${appt.scheduledDate}T${appt.scheduledTime}:00`);
    if (apptDateTime < windowStart || apptDateTime > windowEnd) continue;
    if (!appt.customerId) continue; // no account to notify (e.g. guest/walk-in) — nothing to send to

    const [already] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, "appointment_reminder"), eq(notifications.relatedAppointmentId, appt.id)));
    if (already) continue;

    await notify({
      userId: appt.customerId,
      type: "appointment_reminder",
      title: "Appointment reminder",
      body: `You have an appointment tomorrow, ${appt.scheduledDate} at ${appt.scheduledTime}.`,
      relatedAppointmentId: appt.id,
    });
    results.appointmentReminders++;
  }

  // --- Deposit reminders: pending appointments with an unpaid required
  // deposit, created more than 2 hours ago (give the customer a fair
  // chance to pay immediately after booking before nudging them). ---
  const depositCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const unpaidDeposits = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.status, "pending"), lte(appointments.createdAt, depositCutoff)));

  for (const appt of unpaidDeposits) {
    if (appt.depositRequired <= 0 || appt.depositPaid > 0) continue;
    if (!appt.customerId) continue;

    const [already] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, "deposit_reminder"), eq(notifications.relatedAppointmentId, appt.id)));
    if (already) continue;

    await notify({
      userId: appt.customerId,
      type: "deposit_reminder",
      title: "Deposit still needed to confirm your booking",
      body: `Your ${appt.scheduledDate} ${appt.scheduledTime} booking needs a GH₵${appt.depositRequired} deposit to be confirmed.`,
      relatedAppointmentId: appt.id,
    });
    results.depositReminders++;
  }

  return results;
}
