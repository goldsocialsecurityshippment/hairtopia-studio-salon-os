"use server";

import { db } from "@/db";
import { services, serviceVariations, serviceCategories, salonSettings, staffRules, staffRuleAcknowledgements, galleryImages, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const serviceSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceMin: z.number().nonnegative(),
  priceMax: z.number().nonnegative().optional(),
  durationMinutes: z.number().positive(),
  active: z.boolean().default(true),
});

export async function upsertService(input: z.infer<typeof serviceSchema>) {
  const session = await requireRole("owner", "admin", "manager");
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (data.id) {
    const [before] = await db.select().from(services).where(eq(services.id, data.id));
    await db
      .update(services)
      .set({
        categoryId: data.categoryId,
        name: data.name,
        description: data.description || null,
        priceMin: data.priceMin,
        priceMax: data.priceMax ?? null,
        durationMinutes: data.durationMinutes,
        active: data.active,
      })
      .where(eq(services.id, data.id));
    await recordAudit({
      session,
      action: "service_updated",
      entityType: "service",
      entityId: data.id,
      before,
      after: data,
    });
    revalidatePath("/admin/services");
    return { ok: true as const, id: data.id };
  }

  const [created] = await db
    .insert(services)
    .values({
      categoryId: data.categoryId,
      name: data.name,
      description: data.description || null,
      priceMin: data.priceMin,
      priceMax: data.priceMax ?? null,
      durationMinutes: data.durationMinutes,
      active: data.active,
    })
    .returning();

  await recordAudit({
    session,
    action: "service_created",
    entityType: "service",
    entityId: created.id,
    after: data,
  });

  revalidatePath("/admin/services");
  return { ok: true as const, id: created.id };
}

export async function setServiceActive(id: string, active: boolean) {
  const session = await requireRole("owner", "admin", "manager");
  await db.update(services).set({ active }).where(eq(services.id, id));
  await recordAudit({ session, action: "service_active_toggled", entityType: "service", entityId: id, after: { active } });
  revalidatePath("/admin/services");
  return { ok: true as const };
}

const variationSchema = z.object({
  id: z.string().optional(),
  serviceId: z.string(),
  label: z.string().min(1),
  price: z.number().positive(),
});

export async function upsertVariation(input: z.infer<typeof variationSchema>) {
  const session = await requireRole("owner", "admin", "manager");
  const parsed = variationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (data.id) {
    await db
      .update(serviceVariations)
      .set({ label: data.label, price: data.price })
      .where(eq(serviceVariations.id, data.id));
  } else {
    await db.insert(serviceVariations).values(data);
  }

  await recordAudit({
    session,
    action: "service_variation_saved",
    entityType: "service_variation",
    entityId: data.id ?? data.serviceId,
    after: data,
  });

  revalidatePath("/admin/services");
  return { ok: true as const };
}

export async function deleteVariation(id: string) {
  const session = await requireRole("owner", "admin", "manager");
  await db.delete(serviceVariations).where(eq(serviceVariations.id, id));
  await recordAudit({ session, action: "service_variation_deleted", entityType: "service_variation", entityId: id });
  revalidatePath("/admin/services");
  return { ok: true as const };
}

export async function addCategory(name: string) {
  const session = await requireRole("owner", "admin", "manager");
  const [created] = await db.insert(serviceCategories).values({ name }).returning();
  await recordAudit({ session, action: "category_created", entityType: "service_category", entityId: created.id, after: { name } });
  revalidatePath("/admin/services");
  return { ok: true as const, id: created.id };
}

/** Salon-wide configuration — nothing here should ever be hard-coded in the UI. */
const settingsSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  mapUrl: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  openTime: z.string(),
  closeTime: z.string(),
  checkInRadiusMeters: z.number().positive(),
  attendanceGracePeriodMinutes: z.number().nonnegative(),
  cancellationPolicy: z.string(),
  noShowGraceMinutes: z.number().nonnegative(),
  depositEnabled: z.boolean(),
  depositPercent: z.number().min(0).max(100),
  bookingBufferMinutes: z.number().nonnegative(),
  // --- V2 additions ---
  depositMode: z.enum(["flat", "percent"]),
  depositFlatAmount: z.number().nonnegative(),
  cancellationWindowHours: z.number().nonnegative(),
  overbookingAllowed: z.boolean(),
  overtimeAllowedMinutes: z.number().nonnegative(),
  lowStockDefaultThreshold: z.number().nonnegative(),
});

export async function updateSalonSettings(input: z.infer<typeof settingsSchema>) {
  const session = await requireRole("owner");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [before] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));

  await db
    .update(salonSettings)
    .set({ ...parsed.data, latitude: parsed.data.latitude ?? null, longitude: parsed.data.longitude ?? null })
    .where(eq(salonSettings.id, "main"));

  await recordAudit({
    session,
    action: "salon_settings_updated",
    entityType: "salon_settings",
    entityId: "main",
    before,
    after: parsed.data,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { ok: true as const };
}

const ruleSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export async function addStaffRule(input: z.infer<typeof ruleSchema>) {
  const session = await requireRole("owner");
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const [created] = await db.insert(staffRules).values(parsed.data).returning();
  await recordAudit({ session, action: "staff_rule_created", entityType: "staff_rule", entityId: created.id });

  // Notify every active staff member once, at creation — this schema
  // treats "created" and "published/active" as the same event (there is no
  // separate draft state), so there is no re-publish path that could
  // duplicate this notification for the same rule row.
  if (created.requiresAcknowledgement) {
    const { inArray } = await import("drizzle-orm");
    const staff = await db.select().from(users).where(inArray(users.role, ["stylist", "manager"]));
    await Promise.all(
      staff.map((s) =>
        notify({
          userId: s.id,
          type: "staff_rule_published",
          title: "New staff rule requires acknowledgement",
          body: `"${created.title}" (${created.category}) has been published — please review and acknowledge it.`,
        })
      )
    );
  }

  revalidatePath("/admin/rules");
  return { ok: true as const };
}

export async function acknowledgeRule(ruleId: string) {
  const { requireRole: rr } = await import("@/lib/auth/session");
  const session = await rr("stylist", "manager", "owner");
  const [rule] = await db.select().from(staffRules).where(eq(staffRules.id, ruleId));
  if (!rule) return { ok: false as const, error: "Rule not found." };
  await db.insert(staffRuleAcknowledgements).values({
    ruleId,
    ruleVersion: rule.version,
    staffId: session.userId,
  });
  revalidatePath("/stylist/rules");
  return { ok: true as const };
}

/** ---------- GALLERY ---------- */
const galleryUploadSchema = z.object({
  category: z.string().min(1, "Please choose a category."),
  mediaUrl: z.string().min(1),
  mediaType: z.enum(["image", "video"]).default("image"),
  caption: z.string().optional(),
});

export async function addGalleryImage(input: z.infer<typeof galleryUploadSchema>) {
  const session = await requireRole("owner", "admin", "manager");
  const parsed = galleryUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [created] = await db
    .insert(galleryImages)
    .values({ ...parsed.data, uploadedByUserId: session.userId })
    .returning();

  await recordAudit({
    session,
    action: "gallery_image_added",
    entityType: "gallery_image",
    entityId: created.id,
    after: { category: parsed.data.category },
  });

  revalidatePath("/admin/gallery");
  revalidatePath("/");
  return { ok: true as const, id: created.id };
}

export async function deleteGalleryImage(id: string) {
  const session = await requireRole("owner", "admin", "manager");
  await db.delete(galleryImages).where(eq(galleryImages.id, id));
  await recordAudit({ session, action: "gallery_image_deleted", entityType: "gallery_image", entityId: id });
  revalidatePath("/admin/gallery");
  revalidatePath("/");
  return { ok: true as const };
}
