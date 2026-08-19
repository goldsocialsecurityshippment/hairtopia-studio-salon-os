"use server";

import { db } from "@/db";
import {
  appointments,
  appointmentStatusHistory,
  services,
  serviceVariations,
  availability,
  salonSettings,
  customerReferences,
  queueEntries,
  users,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ACTIVE_STATUSES = ["pending", "confirmed", "arrived", "in_service"] as const;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Returns available start times for a stylist/service/date, honoring salon hours,
 * the stylist's weekly schedule, existing appointments, service duration and buffer. */
export async function getAvailableSlots(params: {
  stylistId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
}) {
  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  const [service] = await db.select().from(services).where(eq(services.id, params.serviceId));
  if (!service) return [];

  const dayOfWeek = new Date(params.date + "T00:00:00").getDay();
  const [dayAvailability] = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(availability.stylistId, params.stylistId),
        eq(availability.dayOfWeek, dayOfWeek),
        eq(availability.active, true)
      )
    );

  const openTime = dayAvailability?.startTime ?? settings?.openTime ?? "08:30";
  const closeTime = dayAvailability?.endTime ?? settings?.closeTime ?? "19:30";

  const existing = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.stylistId, params.stylistId),
        eq(appointments.scheduledDate, params.date),
        inArray(appointments.status, [...ACTIVE_STATUSES])
      )
    );

  const duration = service.durationMinutes;
  const buffer = service.bufferMinutes ?? settings?.bookingBufferMinutes ?? 15;
  const slotStep = 30;

  const startMin = timeToMinutes(openTime);
  const endMin = timeToMinutes(closeTime);

  const busyRanges = existing.map((a) => {
    const s = timeToMinutes(a.scheduledTime);
    return { start: s, end: s + a.durationMinutes + buffer };
  });

  const slots: string[] = [];
  const isToday = params.date === new Date().toISOString().slice(0, 10);
  const nowMinutes = timeToMinutes(
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );

  for (let t = startMin; t + duration <= endMin; t += slotStep) {
    if (isToday && t <= nowMinutes) continue;
    const slotEnd = t + duration;
    const conflicts = busyRanges.some((b) => t < b.end && slotEnd + buffer > b.start);
    if (!conflicts) slots.push(minutesToTime(t));
  }

  return slots;
}

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  variationId: z.string().optional(),
  stylistId: z.string().min(1),
  date: z.string().min(1, "Please choose a date."),
  time: z.string().min(1, "Please choose a time."),
  customerName: z.string().min(2, "Please enter your name."),
  customerPhone: z.string().min(9, "Please enter a valid phone number."),
  instructions: z.string().optional(),
  referenceUrls: z.array(z.string()).optional(),
});

export type BookingResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: string };

export async function createAppointment(input: z.infer<typeof bookingSchema>): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  const [service] = await db.select().from(services).where(eq(services.id, data.serviceId));
  if (!service || !service.active) {
    return { ok: false, error: "This service is no longer available." };
  }

  let price = service.priceMin;
  if (data.variationId) {
    const [variation] = await db
      .select()
      .from(serviceVariations)
      .where(eq(serviceVariations.id, data.variationId));
    if (variation) price = variation.price;
  }

  // Re-check for conflicts server-side at the moment of booking (avoid race conditions).
  const slots = await getAvailableSlots({
    stylistId: data.stylistId,
    serviceId: data.serviceId,
    date: data.date,
  });
  if (!slots.includes(data.time)) {
    return {
      ok: false,
      error: "This time is no longer available. Please choose another time.",
    };
  }

  const session = await getSession();

  const [appointment] = await db
    .insert(appointments)
    .values({
      customerId: session?.role === "customer" ? session.userId : null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      serviceId: data.serviceId,
      variationId: data.variationId ?? null,
      stylistId: data.stylistId,
      scheduledDate: data.date,
      scheduledTime: data.time,
      durationMinutes: service.durationMinutes,
      priceEstimate: price,
      instructions: data.instructions || null,
      source: "online",
      status: "confirmed",
    })
    .returning();

  await db.insert(appointmentStatusHistory).values({
    appointmentId: appointment.id,
    status: "confirmed",
    changedByUserId: session?.userId ?? null,
    changedByRole: session?.role ?? "customer",
    note: "Booking created online.",
  });

  if (data.referenceUrls?.length) {
    await db.insert(customerReferences).values(
      data.referenceUrls.map((url) => ({
        appointmentId: appointment.id,
        url,
        type: url.match(/\.(mp4|mov|webm)$/i) ? ("video" as const) : ("image" as const),
      }))
    );
  }

  await recordAudit({
    session,
    action: "appointment_created",
    entityType: "appointment",
    entityId: appointment.id,
    after: { status: "confirmed", stylistId: data.stylistId, date: data.date, time: data.time },
  });

  await notify({
    userId: data.stylistId,
    type: "new_appointment",
    title: "New appointment booked",
    body: `${data.customerName} booked ${service.name} on ${data.date} at ${data.time}.`,
    relatedAppointmentId: appointment.id,
  });

  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner"]));
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "new_booking",
        title: "New booking",
        body: `${data.customerName} booked ${service.name} with a stylist on ${data.date} at ${data.time}.`,
        relatedAppointmentId: appointment.id,
      })
    )
  );

  revalidatePath("/account");
  revalidatePath("/stylist");
  revalidatePath("/admin");

  return { ok: true, appointmentId: appointment.id };
}

/** Walk-in / QR appointment: same table, marked with source, joins the live queue. */
const walkinSchema = z.object({
  serviceId: z.string().min(1),
  variationId: z.string().optional(),
  stylistId: z.string().optional(), // "any" if not specified
  customerName: z.string().min(2, "Please enter your name."),
  customerPhone: z.string().min(9, "Please enter a valid phone number."),
  instructions: z.string().optional(),
  source: z.enum(["walk_in", "qr"]).default("qr"),
});

export async function createWalkIn(input: z.infer<typeof walkinSchema>): Promise<BookingResult> {
  const parsed = walkinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const [service] = await db.select().from(services).where(eq(services.id, data.serviceId));
  if (!service || !service.active) return { ok: false, error: "This service is no longer available." };

  let price = service.priceMin;
  if (data.variationId) {
    const [variation] = await db
      .select()
      .from(serviceVariations)
      .where(eq(serviceVariations.id, data.variationId));
    if (variation) price = variation.price;
  }

  const now = new Date();
  const session = await getSession();

  const [appointment] = await db
    .insert(appointments)
    .values({
      customerId: session?.role === "customer" ? session.userId : null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      serviceId: data.serviceId,
      variationId: data.variationId ?? null,
      stylistId: data.stylistId ?? null,
      scheduledDate: now.toISOString().slice(0, 10),
      scheduledTime: now.toTimeString().slice(0, 5),
      durationMinutes: service.durationMinutes,
      priceEstimate: price,
      instructions: data.instructions || null,
      source: data.source,
      status: "arrived",
      customerArrivedAt: now.toISOString(),
      arrivalLocationVerified: false,
    })
    .returning();

  await db.insert(appointmentStatusHistory).values({
    appointmentId: appointment.id,
    status: "arrived",
    changedByRole: "customer",
    note: data.source === "qr" ? "Joined via QR walk-in." : "Created by reception as walk-in.",
  });

  const existingQueue = await db.select().from(queueEntries);
  const position = existingQueue.filter((q) => q.status === "waiting").length + 1;

  await db.insert(queueEntries).values({
    appointmentId: appointment.id,
    position,
    status: "waiting",
  });

  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner"]));
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "walk_in",
        title: "New walk-in",
        body: `${data.customerName} joined the queue for ${service.name}.`,
        relatedAppointmentId: appointment.id,
      })
    )
  );

  revalidatePath("/admin");
  revalidatePath("/admin/queue");

  return { ok: true, appointmentId: appointment.id };
}

export async function markCustomerArrived(params: {
  appointmentId: string;
  lat?: number;
  lng?: number;
}) {
  const session = await getSession();
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, params.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (appt.customerArrivedAt) return { ok: false as const, error: "Arrival already recorded." };

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  let verified: boolean | null = null;
  if (params.lat != null && params.lng != null && settings?.latitude != null && settings?.longitude != null) {
    const { distanceMeters } = await import("@/lib/geo");
    const dist = distanceMeters(params.lat, params.lng, settings.latitude, settings.longitude);
    verified = dist <= (settings.checkInRadiusMeters ?? 100);
  } else {
    verified = false;
  }

  const now = new Date().toISOString();
  await db
    .update(appointments)
    .set({
      customerArrivedAt: now,
      arrivalLocationVerified: verified,
      status: "arrived",
    })
    .where(eq(appointments.id, params.appointmentId));

  await db.insert(appointmentStatusHistory).values({
    appointmentId: params.appointmentId,
    status: "arrived",
    changedByUserId: session?.userId ?? null,
    changedByRole: session?.role ?? "customer",
    note: verified ? "Customer self check-in (location verified)." : "Customer self check-in (location not verified).",
  });

  if (appt.stylistId) {
    await notify({
      userId: appt.stylistId,
      type: "customer_arrived",
      title: "Customer has arrived",
      body: `${appt.customerName} has arrived for their ${appt.scheduledTime} appointment.`,
      relatedAppointmentId: appt.id,
    });
  }
  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner"]));
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "customer_arrived",
        title: "Customer arrived",
        body: `${appt.customerName} has arrived.`,
        relatedAppointmentId: appt.id,
      })
    )
  );

  revalidatePath(`/account/appointments/${params.appointmentId}`);
  revalidatePath("/stylist");
  revalidatePath("/admin");

  return { ok: true as const, verified };
}

const cancelReasons = ["changed_plans", "emergency", "schedule_conflict", "service_issue", "other"] as const;
const cancelSchema = z.object({
  appointmentId: z.string(),
  reason: z.enum(cancelReasons),
  note: z.string().optional(),
});

export async function cancelAppointment(input: z.infer<typeof cancelSchema>) {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const session = await getSession();
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (["completed", "cancelled", "no_show"].includes(appt.status)) {
    return { ok: false as const, error: "This appointment can no longer be cancelled." };
  }

  await db
    .update(appointments)
    .set({ status: "cancelled" })
    .where(eq(appointments.id, data.appointmentId));

  await db.insert(appointmentStatusHistory).values({
    appointmentId: data.appointmentId,
    status: "cancelled",
    changedByUserId: session?.userId ?? null,
    changedByRole: session?.role ?? "customer",
    note: data.note,
  });

  const { cancellations } = await import("@/db/schema");
  await db.insert(cancellations).values({
    appointmentId: data.appointmentId,
    cancelledByUserId: session?.userId ?? null,
    cancelledByRole: session?.role ?? "customer",
    reason: data.reason,
    note: data.note || null,
  });

  const recipients = [appt.stylistId].filter(Boolean) as string[];
  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner"]));
  recipients.push(...admins.map((a) => a.id));
  await Promise.all(
    recipients.map((uid) =>
      notify({
        userId: uid,
        type: "cancellation",
        title: "Appointment cancelled",
        body: `${appt.customerName}'s appointment on ${appt.scheduledDate} at ${appt.scheduledTime} was cancelled.`,
        relatedAppointmentId: appt.id,
      })
    )
  );

  if (appt.customerId) {
    await notify({
      userId: appt.customerId,
      type: "cancellation_confirmation",
      title: "Cancellation confirmed",
      body: `Your appointment on ${appt.scheduledDate} at ${appt.scheduledTime} has been cancelled.`,
      relatedAppointmentId: appt.id,
    });
  }

  await recordAudit({
    session,
    action: "appointment_cancelled",
    entityType: "appointment",
    entityId: data.appointmentId,
    before: { status: appt.status },
    after: { status: "cancelled", reason: data.reason },
  });

  revalidatePath("/account");
  revalidatePath("/stylist");
  revalidatePath("/admin");

  return { ok: true as const };
}

export async function markNoShow(appointmentId: string) {
  const session = await requireRoleLocal();
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };

  await db.update(appointments).set({ status: "no_show" }).where(eq(appointments.id, appointmentId));
  await db.insert(appointmentStatusHistory).values({
    appointmentId,
    status: "no_show",
    changedByUserId: session.userId,
    changedByRole: session.role,
  });

  await recordAudit({
    session,
    action: "appointment_marked_no_show",
    entityType: "appointment",
    entityId: appointmentId,
    before: { status: appt.status },
    after: { status: "no_show" },
  });

  revalidatePath("/admin");
  revalidatePath("/stylist");
  return { ok: true as const };
}

async function requireRoleLocal() {
  const { requireRole } = await import("@/lib/auth/session");
  return requireRole("stylist", "manager", "owner");
}
