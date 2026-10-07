"use server";

import { db } from "@/db";
import { consultations, consultationPhotos, services, users } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findOrCreateClient } from "@/lib/crm";
import { isStylistEligible, INELIGIBLE_STYLIST_ERROR } from "@/lib/eligibility";

const requestSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(9),
  category: z.string().min(1),
  requestedStylistId: z.string().optional(),
  requestedCategory: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  concerns: z.string().min(1),
  notes: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
});

/** A customer (or anonymous visitor) requests a discovery consultation.
 * This attaches to the central client record immediately, same as a
 * booking or walk-in, so staff see full context when they review it. */
export async function requestConsultation(input: z.infer<typeof requestSchema>) {
  const { headers } = await import("next/headers");
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(clientKeyFromHeaders(await headers(), "consultation"), 5, 15 * 60 * 1000);
  if (!rl.allowed) return { ok: false as const, error: "Too many requests from this connection. Please wait a few minutes and try again." };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the consultation details." };
  const data = parsed.data;
  const session = await getSession();

  const { client } = await findOrCreateClient({
    fullName: data.customerName,
    phone: data.customerPhone,
    linkedUserId: session?.role === "customer" ? session.userId : null,
  });

  const [created] = await db
    .insert(consultations)
    .values({
      clientId: client.id,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      category: data.category,
      requestedStylistId: data.requestedStylistId || null,
      requestedCategory: data.requestedCategory || null,
      preferredDate: data.preferredDate || null,
      preferredTime: data.preferredTime || null,
      concerns: data.concerns,
      notes: data.notes || null,
      hairInfoSnapshot: JSON.stringify({
        hairType: client.hairType,
        hairStatus: client.hairStatus,
        allergies: client.allergies,
      }),
    })
    .returning();

  if (data.photoUrls?.length) {
    await db.insert(consultationPhotos).values(
      data.photoUrls.map((url) => ({ consultationId: created.id, url }))
    );
  }

  await recordAudit({
    session,
    action: "consultation_requested",
    entityType: "consultation",
    entityId: created.id,
    after: { category: data.category },
  });

  const staff = await db.select().from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
  await Promise.all(
    staff.map((s) =>
      notify({
        userId: s.id,
        type: "consultation_requested",
        title: "New consultation request",
        body: `${data.customerName} requested a "${data.category}" consultation.`,
      })
    )
  );

  // If the customer specifically asked for a professional, that person
  // must be notified directly — not just the back office. This is a
  // targeted notification, not a duplicate of the staff broadcast above
  // (managers/owners/admins receive the operational alert; the named
  // professional receives an assignment-style alert about their own
  // upcoming work).
  if (data.requestedStylistId) {
    await notify({
      userId: data.requestedStylistId,
      type: "consultation_assigned",
      title: "A client requested you for a consultation",
      body: `${data.customerName} asked for you specifically for a "${data.category}" consultation. Review it in your consultations list.`,
    });
  }

  revalidatePath("/admin/consultations");
  return { ok: true as const, consultationId: created.id };
}

export async function listConsultations(status?: string) {
  await requireRole("owner", "admin", "manager");
  const rows = status
    ? await db.select().from(consultations).where(eq(consultations.status, status as typeof consultations.$inferSelect.status)).orderBy(desc(consultations.createdAt))
    : await db.select().from(consultations).orderBy(desc(consultations.createdAt));

  // Attach photos so the review UI can actually show what the customer
  // uploaded — this was previously fetched but never surfaced here.
  const allPhotos = await db.select().from(consultationPhotos);
  return rows.map((c) => ({
    ...c,
    photos: allPhotos.filter((p) => p.consultationId === c.id),
  }));
}

const recommendSchema = z.object({
  consultationId: z.string(),
  staffRecommendation: z.string().min(1),
  suggestedServiceId: z.string().optional(),
  suggestedPrice: z.number().positive().optional(),
  suggestedDurationMinutes: z.number().int().positive().optional(),
});

/** Staff reviews the consultation and sends back a recommendation + suggested
 * service/price/duration for the customer to book against. */
export async function sendConsultationRecommendation(input: z.infer<typeof recommendSchema>) {
  const parsed = recommendSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the recommendation details." };
  const session = await requireRole("owner", "admin", "manager", "stylist");

  const [consultation] = await db.select().from(consultations).where(eq(consultations.id, parsed.data.consultationId));
  if (!consultation) return { ok: false as const, error: "Consultation not found." };

  await db
    .update(consultations)
    .set({
      status: "recommendation_sent",
      reviewedByUserId: session.userId,
      staffRecommendation: parsed.data.staffRecommendation,
      suggestedServiceId: parsed.data.suggestedServiceId || null,
      suggestedPrice: parsed.data.suggestedPrice ?? null,
      suggestedDurationMinutes: parsed.data.suggestedDurationMinutes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(consultations.id, parsed.data.consultationId));

  await recordAudit({
    session,
    action: "consultation_recommendation_sent",
    entityType: "consultation",
    entityId: parsed.data.consultationId,
    after: parsed.data,
  });

  if (consultation.clientId) {
    const { clients } = await import("@/db/schema");
    const [client] = await db.select().from(clients).where(eq(clients.id, consultation.clientId));
    if (client?.linkedUserId) {
      await notify({
        userId: client.linkedUserId,
        type: "consultation_update",
        title: "Your consultation recommendation is ready",
        body: parsed.data.staffRecommendation,
      });
    }
  }

  revalidatePath("/admin/consultations");
  return { ok: true as const };
}

export async function setConsultationStatus(consultationId: string, status: "under_review" | "declined" | "completed") {
  const session = await requireRole("owner", "admin", "manager", "stylist");
  await db.update(consultations).set({ status, updatedAt: new Date().toISOString() }).where(eq(consultations.id, consultationId));
  await recordAudit({ session, action: "consultation_status_changed", entityType: "consultation", entityId: consultationId, after: { status } });
  revalidatePath("/admin/consultations");
  return { ok: true as const };
}

/** Converts an accepted consultation directly into a real appointment,
 * carrying over the suggested service/price/duration, and marks the
 * consultation as converted with a link to the resulting appointment. */
export async function convertConsultationToBooking(consultationId: string, stylistId: string, date: string, time: string) {
  const session = await requireRole("owner", "admin", "manager", "stylist");
  const [consultation] = await db.select().from(consultations).where(eq(consultations.id, consultationId));
  if (!consultation) return { ok: false as const, error: "Consultation not found." };
  if (!consultation.suggestedServiceId) {
    return { ok: false as const, error: "This consultation has no suggested service yet." };
  }

  const [service] = await db.select().from(services).where(eq(services.id, consultation.suggestedServiceId));
  if (!service) return { ok: false as const, error: "Suggested service no longer exists." };
  if (!(await isStylistEligible(stylistId, service.id))) {
    return { ok: false as const, error: INELIGIBLE_STYLIST_ERROR };
  }

  const { appointments, appointmentStatusHistory } = await import("@/db/schema");
  const [appointment] = await db
    .insert(appointments)
    .values({
      clientId: consultation.clientId,
      customerName: consultation.customerName,
      customerPhone: consultation.customerPhone,
      serviceId: service.id,
      stylistId,
      scheduledDate: date,
      scheduledTime: time,
      durationMinutes: consultation.suggestedDurationMinutes ?? service.durationMinutes,
      priceEstimate: consultation.suggestedPrice ?? service.priceMin,
      source: "consultation",
      status: "confirmed",
    })
    .returning();

  await db.insert(appointmentStatusHistory).values({
    appointmentId: appointment.id,
    status: "confirmed",
    changedByUserId: session.userId,
    changedByRole: session.role,
    note: `Converted from consultation ${consultation.id}.`,
  });

  await db
    .update(consultations)
    .set({ status: "converted", convertedAppointmentId: appointment.id, updatedAt: new Date().toISOString() })
    .where(eq(consultations.id, consultationId));

  await recordAudit({
    session,
    action: "consultation_converted",
    entityType: "consultation",
    entityId: consultationId,
    after: { appointmentId: appointment.id },
  });

  revalidatePath("/admin/consultations");
  revalidatePath("/admin/appointments");
  return { ok: true as const, appointmentId: appointment.id };
}
