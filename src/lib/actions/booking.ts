"use server";

import { db } from "@/db";
import {
  appointments,
  appointmentServices,
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
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findOrCreateClient } from "@/lib/crm";
import { getAppointmentServiceLines } from "@/lib/data/appointment-services";
import { isStylistEligible, INELIGIBLE_STYLIST_ERROR } from "@/lib/eligibility";
import { computeDeposit } from "@/lib/payments/provider";

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
  serviceId?: string;
  serviceIds?: string[];
  date: string; // YYYY-MM-DD
  excludeAppointmentId?: string; // when re-checking a slot for a reschedule, ignore the appointment being moved
}) {
  const { headers } = await import("next/headers");
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(clientKeyFromHeaders(await headers(), "availability"), 60, 60 * 1000); // 60/min/IP — generous, this is called on every date click
  if (!rl.allowed) return [];

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  const serviceIds = Array.from(new Set(params.serviceIds ?? (params.serviceId ? [params.serviceId] : [])));
  if (serviceIds.length === 0) return [];
  const selectedServices = await db.select().from(services).where(inArray(services.id, serviceIds));
  if (selectedServices.length !== serviceIds.length || selectedServices.some((service) => !service.active)) return [];
  const eligible = await Promise.all(serviceIds.map((serviceId) => isStylistEligible(params.stylistId, serviceId)));
  if (eligible.some((isEligible) => !isEligible)) return [];

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
    )
    .then((rows) => rows.filter((a) => a.id !== params.excludeAppointmentId));

  const duration = selectedServices.reduce((total, service) => total + service.durationMinutes, 0);
  const buffer = Math.max(...selectedServices.map((service) => service.bufferMinutes ?? settings?.bookingBufferMinutes ?? 15));
  const slotStep = 30;

  const startMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  // Overtime: a configured number of extra minutes the salon is willing to
  // run past normal closing, per salonSettings.overtimeAllowedMinutes. This
  // actually extends the bookable window — it isn't just a displayed number.
  const overtimeMinutes = settings?.overtimeAllowedMinutes ?? 0;
  const endMin = closeMin + overtimeMinutes;

  const busyRanges = existing.map((a) => {
    const s = timeToMinutes(a.scheduledTime);
    return { start: s, coreEnd: s + a.durationMinutes, end: s + a.durationMinutes + buffer };
  });

  const slots: string[] = [];
  const isToday = params.date === new Date().toISOString().slice(0, 10);
  const nowMinutes = timeToMinutes(
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );

  // Overbooking: when enabled by the salon, a slot may sit back-to-back
  // against another appointment's buffer window (no gap required) — but
  // never inside another appointment's actual service duration. This is
  // the real rule the booking engine enforces, not a cosmetic setting.
  const overbookingAllowed = settings?.overbookingAllowed ?? false;

  for (let t = startMin; t + duration <= endMin; t += slotStep) {
    if (isToday && t <= nowMinutes) continue;
    const slotEnd = t + duration;
    const conflicts = busyRanges.some((b) =>
      overbookingAllowed ? t < b.coreEnd && slotEnd > b.start : t < b.end && slotEnd + buffer > b.start
    );
    if (!conflicts) slots.push(minutesToTime(t));
  }

  return slots;
}

const serviceSelectionSchema = z.object({
  serviceId: z.string().min(1),
  variationId: z.string().optional(),
  acceptedTermsId: z.string().optional(),
});

const bookingSchema = z.object({
  serviceSelections: z.array(serviceSelectionSchema).max(10).optional(),
  // Keep the original API for existing single-service callers.
  serviceId: z.string().min(1).optional(),
  variationId: z.string().optional(),
  stylistId: z.string().min(1),
  date: z.string().min(1, "Please choose a date."),
  time: z.string().min(1, "Please choose a time."),
  customerName: z.string().min(2, "Please enter your name."),
  customerPhone: z.string().min(9, "Please enter a valid phone number."),
  instructions: z.string().optional(),
  referenceUrls: z.array(z.string()).optional(),
  acceptedTermsId: z.string().optional(),
}).superRefine((data, ctx) => {
  const selections = data.serviceSelections?.length
    ? data.serviceSelections
    : data.serviceId
      ? [{ serviceId: data.serviceId, variationId: data.variationId, acceptedTermsId: data.acceptedTermsId }]
      : [];
  if (selections.length === 0) {
    ctx.addIssue({ code: "custom", message: "Please choose at least one service." });
  }
  if (new Set(selections.map((selection) => selection.serviceId)).size !== selections.length) {
    ctx.addIssue({ code: "custom", message: "Choose each service only once." });
  }
});

export type BookingResult =
  | { ok: true; appointmentId: string; depositRequired: number; priceEstimate: number }
  | { ok: false; error: string };

export async function createAppointment(input: z.infer<typeof bookingSchema>): Promise<BookingResult> {
  const { headers } = await import("next/headers");
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(clientKeyFromHeaders(await headers(), "booking"), 8, 10 * 60 * 1000); // 8 bookings / 10min / IP
  if (!rl.allowed) {
    return { ok: false, error: "Too many booking attempts from this connection. Please wait a few minutes and try again." };
  }

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;
  const selections = data.serviceSelections?.length
    ? data.serviceSelections
    : data.serviceId
      ? [{ serviceId: data.serviceId, variationId: data.variationId, acceptedTermsId: data.acceptedTermsId }]
      : [];
  if (selections.length === 0 || selections.length > 10) {
    return { ok: false, error: "Choose between one and ten services." };
  }
  if (new Set(selections.map((selection) => selection.serviceId)).size !== selections.length) {
    return { ok: false, error: "Choose each service only once." };
  }
  const serviceIds = selections.map((selection) => selection.serviceId);
  const servicesById = await db.select().from(services).where(inArray(services.id, serviceIds));
  const orderedServices = serviceIds.map((serviceId) => servicesById.find((service) => service.id === serviceId));
  if (orderedServices.some((service) => !service || !service.active)) {
    return { ok: false, error: "One or more selected services are no longer available." };
  }
  const selectedServices = orderedServices as (typeof servicesById)[number][];
  const variations = await db.select().from(serviceVariations).where(inArray(serviceVariations.serviceId, serviceIds));
  const { getActiveServiceTerms } = await import("@/lib/actions/service-terms");
  const activeTermsByService = await Promise.all(serviceIds.map((serviceId) => getActiveServiceTerms(serviceId)));
  const acceptedAt = new Date().toISOString();
  const lineItems = selections.map((selection, index) => {
    const service = selectedServices[index];
    const variation = selection.variationId
      ? variations.find((candidate) => candidate.id === selection.variationId && candidate.serviceId === service.id && candidate.active)
      : undefined;
    return {
      selection,
      service,
      variation,
      activeTerms: activeTermsByService[index],
      price: variation?.price ?? service.priceMin,
      durationMinutes: service.durationMinutes,
    };
  });
  for (const item of lineItems) {
    if (item.selection.variationId && !item.variation) {
      return { ok: false, error: `The selected option for ${item.service.name} is no longer available.` };
    }
    if (!item.selection.variationId && data.serviceSelections?.length && variations.some((variation) => variation.serviceId === item.service.id && variation.active)) {
      return { ok: false, error: `Please choose an available option for ${item.service.name}.` };
    }
    if (item.activeTerms && item.selection.acceptedTermsId !== item.activeTerms.id) {
      return { ok: false, error: `Please review and accept the current Terms & Conditions for ${item.service.name}.` };
    }
  }
  // Server-side eligibility: one stylist must be assigned to every service.
  const eligibility = await Promise.all(serviceIds.map((serviceId) => isStylistEligible(data.stylistId, serviceId)));
  if (eligibility.some((isEligible) => !isEligible)) {
    return { ok: false, error: INELIGIBLE_STYLIST_ERROR };
  }
  const price = lineItems.reduce((total, item) => total + item.price, 0);
  const durationMinutes = lineItems.reduce((total, item) => total + item.durationMinutes, 0);
  const serviceNames = lineItems.map((item) => item.service.name).join(", ");

  // Re-check for conflicts server-side at the moment of booking (avoid race conditions).
  const slots = await getAvailableSlots({
    stylistId: data.stylistId,
    serviceIds,
    date: data.date,
  });
  if (!slots.includes(data.time)) {
    return {
      ok: false,
      error: "This time is no longer available. Please choose another time.",
    };
  }

  const session = await getSession();

  // CRM: match to an existing client by normalized phone, or create one.
  // This is what keeps "unique clients" accurate across online + walk-in.
  const { client } = await findOrCreateClient({
    fullName: data.customerName,
    phone: data.customerPhone,
    linkedUserId: session?.role === "customer" ? session.userId : null,
  });

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  const depositRequired = settings
    ? computeDeposit(price, {
        depositEnabled: settings.depositEnabled,
        depositMode: settings.depositMode as "flat" | "percent",
        depositFlatAmount: settings.depositFlatAmount,
        depositPercent: settings.depositPercent,
      })
    : 0;
  const primaryService = lineItems[0];
  const appointmentId = crypto.randomUUID();
  const appointmentInsert = db.insert(appointments).values({
      id: appointmentId,
      customerId: session?.role === "customer" ? session.userId : null,
      clientId: client.id,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      serviceId: primaryService.service.id,
      variationId: primaryService.variation?.id ?? null,
      stylistId: data.stylistId,
      scheduledDate: data.date,
      scheduledTime: data.time,
      durationMinutes,
      priceEstimate: price,
      instructions: data.instructions || null,
      source: "online",
      // Every online booking stays pending until staff approve a submitted
      // Mobile Money proof (even if no deposit is configured).
      status: "pending",
      depositRequired,
      depositPaid: 0,
      balanceDue: price,
      acceptedTermsId: primaryService.activeTerms?.id ?? null,
      acceptedTermsVersion: primaryService.activeTerms?.version ?? null,
      acceptedTermsAt: primaryService.activeTerms ? acceptedAt : null,
    });

  const serviceLinesInsert = db.insert(appointmentServices).values(
    lineItems.map((item, sortOrder) => ({
      id: crypto.randomUUID(),
      appointmentId,
      serviceId: item.service.id,
      variationId: item.variation?.id ?? null,
      price: item.price,
      durationMinutes: item.durationMinutes,
      sortOrder,
      acceptedTermsId: item.activeTerms?.id ?? null,
      acceptedTermsVersion: item.activeTerms?.version ?? null,
      acceptedTermsAt: item.activeTerms ? acceptedAt : null,
    }))
  );
  const statusHistoryInsert = db.insert(appointmentStatusHistory).values({
    appointmentId,
    status: "pending",
    changedByUserId: session?.userId ?? null,
    changedByRole: session?.role ?? "customer",
    note: depositRequired > 0
      ? `Booking created online — awaiting GH₵${depositRequired} deposit proof review.`
      : `Booking created online — awaiting full payment proof review (GH₵${price}).`,
  });
  const referenceInsert = data.referenceUrls?.length
    ? db.insert(customerReferences).values(
      data.referenceUrls.map((url) => ({
        appointmentId,
        url,
        type: url.match(/\.(mp4|mov|webm)$/i) ? ("video" as const) : ("image" as const),
      }))
    )
    : null;
  if (referenceInsert) {
    await db.batch([appointmentInsert, serviceLinesInsert, statusHistoryInsert, referenceInsert]);
  } else {
    await db.batch([appointmentInsert, serviceLinesInsert, statusHistoryInsert]);
  }

  await recordAudit({
    session,
    action: "appointment_created",
    entityType: "appointment",
    entityId: appointmentId,
    after: { status: "pending", serviceIds, stylistId: data.stylistId, date: data.date, time: data.time },
  });

  await notify({
    userId: data.stylistId,
    type: "new_appointment",
    title: "New appointment booked",
    body: `${data.customerName} booked ${serviceNames} on ${data.date} at ${data.time}.`,
    relatedAppointmentId: appointmentId,
    url: "/stylist",
  });

  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "new_booking",
        title: "New booking",
        body: `${data.customerName} booked ${serviceNames} with a stylist on ${data.date} at ${data.time}.`,
        relatedAppointmentId: appointmentId,
        url: "/admin/appointments",
      })
    )
  );

  revalidatePath("/account");
  revalidatePath("/stylist");
  revalidatePath("/admin");

  return { ok: true, appointmentId, depositRequired, priceEstimate: price };
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

  if (data.stylistId && !(await isStylistEligible(data.stylistId, data.serviceId))) {
    return { ok: false, error: INELIGIBLE_STYLIST_ERROR };
  }

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

  // CRM: reception provides the phone number — match existing client or
  // create a new one. Walk-ins never require an online deposit.
  const { client } = await findOrCreateClient({
    fullName: data.customerName,
    phone: data.customerPhone,
    linkedUserId: session?.role === "customer" ? session.userId : null,
  });

  const [appointment] = await db
    .insert(appointments)
    .values({
      customerId: session?.role === "customer" ? session.userId : null,
      clientId: client.id,
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
      depositRequired: 0,
      balanceDue: price,
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

  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
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

  return { ok: true, appointmentId: appointment.id, depositRequired: 0, priceEstimate: price };
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
  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
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

  // 24-hour policy: a CUSTOMER cancelling within the configured window can
  // only *request* the change — staff must approve it. Staff/managers/
  // owner/admin can always cancel directly (they're the ones enforcing the
  // policy, not bypassing it).
  const isStaffActor = session && session.role !== "customer";
  if (!isStaffActor) {
    const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
    const windowHours = settings?.cancellationWindowHours ?? 24;
    const apptDateTime = new Date(`${appt.scheduledDate}T${appt.scheduledTime}:00`);
    const hoursUntil = (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntil < windowHours) {
      await db
        .update(appointments)
        .set({ cancellationRequestStatus: "requested" })
        .where(eq(appointments.id, data.appointmentId));

      await recordAudit({
        session,
        action: "cancellation_requested",
        entityType: "appointment",
        entityId: data.appointmentId,
        before: { cancellationRequestStatus: appt.cancellationRequestStatus },
        after: { cancellationRequestStatus: "requested", reason: data.reason, hoursUntil },
      });

      const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
      await Promise.all(
        admins.map((a) =>
          notify({
            userId: a.id,
            type: "cancellation_request",
            title: "Cancellation request (inside policy window)",
            body: `${appt.customerName} wants to cancel their ${appt.scheduledDate} ${appt.scheduledTime} appointment — within the ${windowHours}h window. Review required.`,
            relatedAppointmentId: appt.id,
          })
        )
      );

      revalidatePath("/account");
      revalidatePath("/admin");
      return {
        ok: false as const,
        error: `This is within our ${windowHours}-hour cancellation window, so we've sent your request to the salon for review rather than cancelling automatically.`,
      };
    }
  }

  await db
    .update(appointments)
    .set({ status: "cancelled", cancellationRequestStatus: "none" })
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
  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
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

/** Staff reviews a within-window cancellation request (see cancelAppointment). */
export async function resolveCancellationRequest(params: {
  appointmentId: string;
  decision: "approved" | "declined";
  note?: string;
}) {
  const session = await requireRoleLocal();
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, params.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (appt.cancellationRequestStatus !== "requested") {
    return { ok: false as const, error: "There is no pending cancellation request on this appointment." };
  }

  if (params.decision === "approved") {
    await db
      .update(appointments)
      .set({ status: "cancelled", cancellationRequestStatus: "approved" })
      .where(eq(appointments.id, params.appointmentId));

    const { cancellations } = await import("@/db/schema");
    await db.insert(cancellations).values({
      appointmentId: params.appointmentId,
      cancelledByUserId: session.userId,
      cancelledByRole: session.role,
      reason: "other",
      note: params.note || "Approved within-policy-window cancellation request.",
    });
  } else {
    await db
      .update(appointments)
      .set({ cancellationRequestStatus: "declined" })
      .where(eq(appointments.id, params.appointmentId));
  }

  await recordAudit({
    session,
    action: "cancellation_request_resolved",
    entityType: "appointment",
    entityId: params.appointmentId,
    before: { cancellationRequestStatus: "requested" },
    after: { cancellationRequestStatus: params.decision, note: params.note },
  });

  if (appt.customerId) {
    await notify({
      userId: appt.customerId,
      type: "cancellation_request_resolved",
      title: params.decision === "approved" ? "Cancellation approved" : "Cancellation request declined",
      body:
        params.decision === "approved"
          ? `Your appointment on ${appt.scheduledDate} at ${appt.scheduledTime} has been cancelled.`
          : `Your request to cancel the ${appt.scheduledDate} ${appt.scheduledTime} appointment was declined. ${params.note ?? ""}`.trim(),
      relatedAppointmentId: appt.id,
    });
  }

  // Fix from the audit: the direct-cancel path already notifies the
  // assigned professional; the approval-workflow path did not. Only
  // notify on approval (the appointment is genuinely gone) — a decline
  // means the professional's schedule is unaffected.
  if (params.decision === "approved" && appt.stylistId) {
    await notify({
      userId: appt.stylistId,
      type: "cancellation_confirmation",
      title: "Appointment cancelled",
      body: `The ${appt.scheduledDate} ${appt.scheduledTime} appointment for ${appt.customerName} has been cancelled.`,
      relatedAppointmentId: appt.id,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true as const };
}

/** Staff may set the agreed price only within the combined range of all
 * service lines; the shared balance is recalculated and the change audited. */
export async function setAppointmentFinalPrice(appointmentId: string, finalPrice: number) {
  const session = await requireRole("manager", "owner", "admin", "stylist");
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (session.role === "stylist" && appt.stylistId !== session.userId) {
    return { ok: false as const, error: "You can only adjust the price of your own appointments." };
  }

  const serviceLines = await getAppointmentServiceLines(appt);
  if (serviceLines.length === 0) return { ok: false as const, error: "Service not found." };
  const min = serviceLines.reduce((total, line) => total + line.minPrice, 0);
  const max = serviceLines.reduce((total, line) => total + line.maxPrice, 0);
  if (finalPrice < min || finalPrice > max) {
    return { ok: false as const, error: `Price must be between GH₵${min} and GH₵${max} for the selected services.` };
  }

  const newBalance = Math.max(0, finalPrice - appt.depositPaid);
  await db
    .update(appointments)
    .set({ priceEstimate: finalPrice, balanceDue: newBalance })
    .where(eq(appointments.id, appointmentId));

  await recordAudit({
    session,
    action: "appointment_final_price_set",
    entityType: "appointment",
    entityId: appointmentId,
    before: { priceEstimate: appt.priceEstimate },
    after: { priceEstimate: finalPrice },
  });

  revalidatePath(`/admin/appointments/${appointmentId}`);
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
  return requireRole("stylist", "manager", "owner", "admin");
}
