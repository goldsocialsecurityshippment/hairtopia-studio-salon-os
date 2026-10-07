"use server";

import { db } from "@/db";
import { clients, clientVisits, clientPhotos, appointments } from "@/db/schema";
import { eq, or, like, sql, desc } from "drizzle-orm";
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertClientAccess, redactClientForScope } from "@/lib/crm";

/**
 * Client search — admin/authorized users only. Distinguishes UNIQUE CLIENTS
 * (rows in `clients`) from APPOINTMENTS/VISITS: the count shown per client
 * is always "how many appointments this one client has", never counted as
 * separate clients.
 */
export async function searchClients(query: string) {
  await requireRole("owner", "admin", "manager");
  const q = `%${query.trim()}%`;

  const rows = query.trim()
    ? await db
        .select()
        .from(clients)
        .where(or(like(clients.fullName, q), like(clients.phone, q), like(clients.whatsapp, q), like(clients.email, q)))
        .limit(50)
    : await db.select().from(clients).orderBy(desc(clients.createdAt)).limit(50);

  const results = await Promise.all(
    rows.map(async (c) => {
      const clientAppointments = await db.select().from(appointments).where(eq(appointments.clientId, c.id));
      const completed = clientAppointments.filter((a) => a.status === "completed");
      const lastVisit = completed.sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))[0];
      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        appointmentCount: clientAppointments.length, // appointments, NOT a client count
        lastVisitDate: lastVisit?.scheduledDate ?? null,
        lastStylistId: lastVisit?.stylistId ?? null,
      };
    })
  );

  return results;
}

/** True unique-client count — one row per phone-matched person, regardless
 * of how many times they've booked. */
export async function countUniqueClients() {
  await requireRole("owner", "admin", "manager");
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(clients);
  return row?.count ?? 0;
}

/** Privacy-scoped single client fetch. Returns null if the caller isn't
 * allowed to see this client at all; returns a redacted object otherwise —
 * this redaction happens here, server-side, not in the component. */
export async function getClientForViewer(clientId: string) {
  const session = await getSession();
  const access = await assertClientAccess(session, clientId);
  if (!access.allowed) return null;

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return null;

  const visits = await db
    .select()
    .from(clientVisits)
    .where(eq(clientVisits.clientId, clientId))
    .orderBy(desc(clientVisits.visitDate));

  const photos = await db.select().from(clientPhotos).where(eq(clientPhotos.clientId, clientId));
  const visiblePhotos =
    access.scope === "full" || access.scope === "self"
      ? photos
      : photos.filter((p) => p.visibility !== "private_staff" || access.scope === "assigned");

  const clientAppointments = await db.select().from(appointments).where(eq(appointments.clientId, clientId));

  return {
    scope: access.scope,
    client: redactClientForScope(client, access.scope),
    visits,
    photos: visiblePhotos,
    appointments: clientAppointments,
  };
}

const intakeSchema = z.object({
  clientId: z.string(),
  fullName: z.string().min(1).optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  preferredContact: z.enum(["phone", "whatsapp", "email"]).optional(),
  hairType: z.string().optional(),
  hairLength: z.string().optional(),
  hairDensity: z.string().optional(),
  hairCondition: z.string().optional(),
  scalpCondition: z.string().optional(),
  scalpConcerns: z.string().optional(),
  chemicalHistory: z.string().optional(),
  colourHistory: z.string().optional(),
  bleachHistory: z.string().optional(),
  hairStatus: z.enum(["natural", "relaxed", "transitioning", "colour_treated", "unspecified"]).optional(),
  protectiveStyleHistory: z.string().optional(),
  preferredProducts: z.string().optional(),
  allergies: z.string().optional(),
  sensitivities: z.string().optional(),
  previousReactions: z.string().optional(),
  specialRequests: z.string().optional(),
  notes: z.string().optional(),
});

/** Updates a client's intake/profile. Enforces the same server-side privacy
 * scope as reads: a stylist can only update a client they're assigned to,
 * and cannot touch front-of-house `notes`. */
export async function updateClientProfile(input: z.infer<typeof intakeSchema>) {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the profile details." };
  const { clientId, ...fields } = parsed.data;

  const session = await getSession();
  const access = await assertClientAccess(session, clientId);
  if (!access.allowed) return { ok: false as const, error: "You do not have access to this client record." };
  if (access.scope !== "full" && access.scope !== "assigned") {
    return { ok: false as const, error: "You do not have permission to edit this client's profile." };
  }

  // Stylists (assigned scope) may update hair/service fields, but never the
  // private front-of-house `notes` field.
  const updates = access.scope === "assigned" ? { ...fields, notes: undefined } : fields;

  await db
    .update(clients)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(clients.id, clientId));

  await recordAudit({
    session,
    action: "client_profile_updated",
    entityType: "client",
    entityId: clientId,
    after: updates,
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true as const };
}

const visitSchema = z.object({
  clientId: z.string(),
  appointmentId: z.string().optional(),
  serviceId: z.string().optional(),
  hairConditionObserved: z.string().optional(),
  productsUsed: z.string().optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
});

/** Logs a clinical visit note. Only the assigned stylist (for their own
 * client) or back-office roles may write this. */
export async function addClientVisit(input: z.infer<typeof visitSchema>) {
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the visit details." };
  const session = await getSession();
  const access = await assertClientAccess(session, parsed.data.clientId);
  if (!access.allowed || (access.scope !== "full" && access.scope !== "assigned")) {
    return { ok: false as const, error: "You do not have permission to add a visit note for this client." };
  }

  const [created] = await db
    .insert(clientVisits)
    .values({
      ...parsed.data,
      appointmentId: parsed.data.appointmentId || null,
      serviceId: parsed.data.serviceId || null,
      stylistId: session!.role === "stylist" ? session!.userId : null,
      visitDate: new Date().toISOString().slice(0, 10),
      createdByUserId: session!.userId,
    })
    .returning();

  await recordAudit({
    session,
    action: "client_visit_logged",
    entityType: "client_visit",
    entityId: created.id,
    after: { clientId: parsed.data.clientId },
  });

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true as const };
}

const photoSchema = z.object({
  clientId: z.string(),
  appointmentId: z.string().optional(),
  url: z.string().min(1),
  photoType: z.enum(["before", "after", "inspiration", "service"]),
  visibility: z.enum(["private_staff", "assigned_stylist_only", "public"]).default("private_staff"),
});

export async function addClientPhoto(input: z.infer<typeof photoSchema>) {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the photo details." };
  const session = await getSession();
  const access = await assertClientAccess(session, parsed.data.clientId);
  if (!access.allowed || (access.scope !== "full" && access.scope !== "assigned")) {
    return { ok: false as const, error: "You do not have permission to add photos for this client." };
  }

  await db.insert(clientPhotos).values({
    ...parsed.data,
    appointmentId: parsed.data.appointmentId || null,
    uploadedByUserId: session!.userId,
  });

  await recordAudit({
    session,
    action: "client_photo_added",
    entityType: "client_photo",
    entityId: parsed.data.clientId,
    after: { photoType: parsed.data.photoType, visibility: parsed.data.visibility },
  });

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true as const };
}

/** A staff member (owner/admin/manager) can approve a client photo for
 * public display — e.g. on the team showcase or gallery. Never automatic. */
export async function approveClientPhotoForPublic(photoId: string, approved: boolean) {
  const session = await requireRole("owner", "admin", "manager");
  await db
    .update(clientPhotos)
    .set({ publicApproved: approved, visibility: approved ? "public" : "private_staff" })
    .where(eq(clientPhotos.id, photoId));

  await recordAudit({
    session,
    action: "client_photo_public_approval_changed",
    entityType: "client_photo",
    entityId: photoId,
    after: { approved },
  });
  return { ok: true as const };
}
