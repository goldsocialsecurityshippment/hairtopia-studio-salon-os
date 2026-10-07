"use server";

import { db } from "@/db";
import { appointments, rescheduleRequests, salonSettings, appointmentStatusHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAvailableSlots } from "@/lib/actions/booking";
import { isStylistEligible, INELIGIBLE_STYLIST_ERROR } from "@/lib/eligibility";

const requestSchema = z.object({
  appointmentId: z.string(),
  requestedDate: z.string().min(1),
  requestedTime: z.string().min(1),
  requestedStylistId: z.string().optional(),
  reason: z.string().optional(),
});

async function hoursUntil(appointmentId: string) {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return { appt: null, hours: 0 };
  const dt = new Date(`${appt.scheduledDate}T${appt.scheduledTime}:00`);
  return { appt, hours: (dt.getTime() - Date.now()) / (1000 * 60 * 60) };
}

/**
 * Customer requests a reschedule. This NEVER changes the appointment
 * directly — it only ever creates a pending request that staff must
 * approve. That is the one and only path a customer can use; there is no
 * separate "apply immediately" branch a client-side call could hit, so a
 * customer cannot bypass staff review no matter what they send.
 */
export async function requestReschedule(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the reschedule details." };
  const data = parsed.data;
  const session = await getSession();

  const { appt, hours } = await hoursUntil(data.appointmentId);
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (session?.role === "customer" && appt.customerId !== session.userId) {
    return { ok: false as const, error: "You can only reschedule your own appointments." };
  }
  if (["completed", "cancelled", "no_show"].includes(appt.status)) {
    return { ok: false as const, error: "This appointment can no longer be rescheduled." };
  }

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  const windowHours = settings?.cancellationWindowHours ?? 24;

  const isStaffActor = session && session.role !== "customer";
  if (!isStaffActor && hours < windowHours) {
    return {
      ok: false as const,
      error: `Reschedule requests must be made at least ${windowHours} hours before your appointment. Please contact the salon directly.`,
    };
  }

  const targetStylistId = data.requestedStylistId || appt.stylistId;
  if (!targetStylistId) return { ok: false as const, error: "No professional assigned to check availability against." };
  if (!(await isStylistEligible(targetStylistId, appt.serviceId))) {
    return { ok: false as const, error: INELIGIBLE_STYLIST_ERROR };
  }

  const slots = await getAvailableSlots({
    stylistId: targetStylistId,
    serviceId: appt.serviceId,
    date: data.requestedDate,
    excludeAppointmentId: appt.id,
  });
  if (!slots.includes(data.requestedTime)) {
    return { ok: false as const, error: "That time is no longer available. Please choose a different slot." };
  }

  await db
    .update(rescheduleRequests)
    .set({ status: "superseded" })
    .where(and(eq(rescheduleRequests.appointmentId, appt.id), eq(rescheduleRequests.status, "pending")));

  const [created] = await db
    .insert(rescheduleRequests)
    .values({
      appointmentId: appt.id,
      requestedDate: data.requestedDate,
      requestedTime: data.requestedTime,
      requestedStylistId: data.requestedStylistId || null,
      reason: data.reason || null,
      requestedByUserId: session?.userId ?? null,
      requestedByRole: session?.role ?? "customer",
      previousDate: appt.scheduledDate,
      previousTime: appt.scheduledTime,
      previousStylistId: appt.stylistId,
    })
    .returning();

  await recordAudit({
    session,
    action: "reschedule_requested",
    entityType: "appointment",
    entityId: appt.id,
    after: { requestedDate: data.requestedDate, requestedTime: data.requestedTime },
  });

  const { users } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  const staff = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
  await Promise.all(
    staff.map((s) =>
      notify({
        userId: s.id,
        type: "reschedule_requested",
        title: "Reschedule request",
        body: `${appt.customerName} requested to move their ${appt.scheduledDate} ${appt.scheduledTime} appointment to ${data.requestedDate} ${data.requestedTime}.`,
        relatedAppointmentId: appt.id,
      })
    )
  );

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true as const, requestId: created.id };
}

/** Staff approves or declines a pending reschedule request. Approval
 * RE-CHECKS availability at the moment of approval (not just at request
 * time) — someone else may have booked that slot in the meantime — and
 * refuses rather than silently double-booking. */
export async function resolveRescheduleRequest(params: {
  requestId: string;
  decision: "approved" | "declined";
  note?: string;
}) {
  const session = await requireRole("manager", "owner", "admin");
  const [request] = await db.select().from(rescheduleRequests).where(eq(rescheduleRequests.id, params.requestId));
  if (!request) return { ok: false as const, error: "Request not found." };
  if (request.status !== "pending") return { ok: false as const, error: "This request has already been resolved." };

  const [appt] = await db.select().from(appointments).where(eq(appointments.id, request.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };

  if (params.decision === "declined") {
    await db
      .update(rescheduleRequests)
      .set({ status: "declined", resolvedByUserId: session.userId, resolvedAt: new Date().toISOString() })
      .where(eq(rescheduleRequests.id, params.requestId));

    await recordAudit({
      session,
      action: "reschedule_declined",
      entityType: "appointment",
      entityId: appt.id,
      after: { note: params.note },
    });

    if (appt.customerId) {
      await notify({
        userId: appt.customerId,
        type: "reschedule_declined",
        title: "Reschedule request declined",
        body: `Your request to move your ${appt.scheduledDate} ${appt.scheduledTime} appointment was declined. ${params.note ?? ""}`.trim(),
        relatedAppointmentId: appt.id,
      });
    }

    revalidatePath("/admin");
    revalidatePath("/account");
    return { ok: true as const };
  }

  const targetStylistId = request.requestedStylistId || appt.stylistId!;
  if (!(await isStylistEligible(targetStylistId, appt.serviceId))) {
    return { ok: false as const, error: INELIGIBLE_STYLIST_ERROR };
  }
  const slots = await getAvailableSlots({
    stylistId: targetStylistId,
    serviceId: appt.serviceId,
    date: request.requestedDate,
    excludeAppointmentId: appt.id,
  });
  if (!slots.includes(request.requestedTime)) {
    return {
      ok: false as const,
      error: "That slot is no longer available (someone else may have booked it) — decline this request or ask the customer for a different time.",
    };
  }

  const previousDate = appt.scheduledDate;
  const previousTime = appt.scheduledTime;
  const previousStylistId = appt.stylistId;

  await db
    .update(appointments)
    .set({
      scheduledDate: request.requestedDate,
      scheduledTime: request.requestedTime,
      stylistId: targetStylistId,
    })
    .where(eq(appointments.id, appt.id));

  await db
    .update(rescheduleRequests)
    .set({ status: "approved", resolvedByUserId: session.userId, resolvedAt: new Date().toISOString() })
    .where(eq(rescheduleRequests.id, params.requestId));

  await db.insert(appointmentStatusHistory).values({
    appointmentId: appt.id,
    status: appt.status,
    changedByUserId: session.userId,
    changedByRole: session.role,
    note: `Rescheduled from ${previousDate} ${previousTime} to ${request.requestedDate} ${request.requestedTime}${
      targetStylistId !== previousStylistId ? " (professional reassigned)" : ""
    }.`,
  });

  await recordAudit({
    session,
    action: "reschedule_approved",
    entityType: "appointment",
    entityId: appt.id,
    before: { scheduledDate: previousDate, scheduledTime: previousTime, stylistId: previousStylistId },
    after: { scheduledDate: request.requestedDate, scheduledTime: request.requestedTime, stylistId: targetStylistId },
  });

  if (appt.customerId) {
    await notify({
      userId: appt.customerId,
      type: "reschedule_approved",
      title: "Reschedule approved",
      body: `Your appointment has been moved to ${request.requestedDate} at ${request.requestedTime}.`,
      relatedAppointmentId: appt.id,
    });
  }
  if (targetStylistId) {
    await notify({
      userId: targetStylistId,
      type: "appointment_changed",
      title: "Appointment rescheduled",
      body: `${appt.customerName}'s appointment is now ${request.requestedDate} at ${request.requestedTime}.`,
      relatedAppointmentId: appt.id,
    });
  }
  if (previousStylistId && previousStylistId !== targetStylistId) {
    await notify({
      userId: previousStylistId,
      type: "appointment_changed",
      title: "Appointment reassigned",
      body: `${appt.customerName}'s ${previousDate} ${previousTime} appointment has been moved to another professional.`,
      relatedAppointmentId: appt.id,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/account");
  revalidatePath("/stylist");
  return { ok: true as const };
}

/** Convenience path for staff creating AND immediately approving a
 * reschedule on a customer's behalf (e.g. over the phone) — still goes
 * through the exact same availability re-check and audit trail, just
 * without the separate pending step. */
export async function staffReschedule(params: {
  appointmentId: string;
  requestedDate: string;
  requestedTime: string;
  requestedStylistId?: string;
  note?: string;
}) {
  const created = await requestReschedule(params);
  if (!created.ok) return created;
  return resolveRescheduleRequest({ requestId: created.requestId, decision: "approved", note: params.note });
}

export async function listRescheduleRequests(status: "pending" | "all" = "pending") {
  await requireRole("manager", "owner", "admin");
  const rows = await db.select().from(rescheduleRequests);
  return status === "pending" ? rows.filter((r) => r.status === "pending") : rows;
}
