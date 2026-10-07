"use server";

import { db } from "@/db";
import { serviceTerms, appointments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** The currently-active terms for a service, if any. Public — the customer
 * must be able to read these before booking. */
export async function getActiveServiceTerms(serviceId: string) {
  const [terms] = await db
    .select()
    .from(serviceTerms)
    .where(and(eq(serviceTerms.serviceId, serviceId), eq(serviceTerms.active, true)))
    .orderBy(desc(serviceTerms.version))
    .limit(1);
  return terms ?? null;
}

export async function listServiceTermsHistory(serviceId: string) {
  await requireRole("owner", "admin", "manager");
  return db.select().from(serviceTerms).where(eq(serviceTerms.serviceId, serviceId)).orderBy(desc(serviceTerms.version));
}

const termsSchema = z.object({
  serviceId: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
});

/** Publishes a NEW version of a service's terms (never edits an old version
 * in place, so a past booking's `acceptedTermsVersion` always still points
 * to the exact wording that customer agreed to). Deactivates the previous
 * active version. Reusable for any service, not just Bridal Makeup. */
export async function publishServiceTerms(input: z.infer<typeof termsSchema>) {
  const session = await requireRole("owner", "admin");
  const parsed = termsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please provide a title and content." };

  const history = await db.select().from(serviceTerms).where(eq(serviceTerms.serviceId, parsed.data.serviceId)).orderBy(desc(serviceTerms.version));
  const nextVersion = (history[0]?.version ?? 0) + 1;

  await db.update(serviceTerms).set({ active: false }).where(eq(serviceTerms.serviceId, parsed.data.serviceId));

  const [created] = await db
    .insert(serviceTerms)
    .values({ ...parsed.data, version: nextVersion, active: true, createdByUserId: session.userId })
    .returning();

  await recordAudit({
    session,
    action: "service_terms_published",
    entityType: "service_terms",
    entityId: created.id,
    after: { serviceId: parsed.data.serviceId, version: nextVersion },
  });

  revalidatePath("/admin/services");
  return { ok: true as const, version: nextVersion };
}

/** Records that a customer accepted a specific terms version at booking
 * time — preserved permanently on the appointment, independent of any
 * later edits to the terms record itself. */
export async function acceptServiceTermsForAppointment(appointmentId: string, termsId: string) {
  const [terms] = await db.select().from(serviceTerms).where(eq(serviceTerms.id, termsId));
  if (!terms) return { ok: false as const, error: "Terms not found." };

  await db
    .update(appointments)
    .set({
      acceptedTermsId: terms.id,
      acceptedTermsVersion: terms.version,
      acceptedTermsAt: new Date().toISOString(),
    })
    .where(eq(appointments.id, appointmentId));

  return { ok: true as const };
}
