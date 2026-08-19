"use server";

import { db } from "@/db";
import { users, staffProfiles, stylistServices, availability } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const addStaffSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["stylist", "manager"]),
  bio: z.string().optional(),
  specialties: z.string().optional(),
  yearsExperience: z.coerce.number().optional(),
  serviceIds: z.array(z.string()).optional(),
});

/** Owner adds a stylist or manager. A temporary password is generated and returned once. */
export async function addStaff(input: z.infer<typeof addStaffSchema>) {
  const session = await requireRole("owner", "manager");
  const parsed = addStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (data.role === "manager" && session.role !== "owner") {
    return { ok: false as const, error: "Only the owner can add managers." };
  }

  const tempPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await hashPassword(tempPassword);

  const [user] = await db
    .insert(users)
    .values({
      role: data.role,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      passwordHash,
    })
    .returning();

  await db.insert(staffProfiles).values({
    userId: user.id,
    bio: data.bio || null,
    specialties: data.specialties || null,
    yearsExperience: data.yearsExperience || null,
    hireDate: new Date().toISOString().slice(0, 10),
  });

  if (data.serviceIds?.length) {
    await db.insert(stylistServices).values(
      data.serviceIds.map((serviceId) => ({ stylistId: user.id, serviceId }))
    );
  }

  // Default Mon-Sat availability matching salon hours; owner can edit later.
  const defaultDays = [1, 2, 3, 4, 5, 6];
  await db.insert(availability).values(
    defaultDays.map((d) => ({
      stylistId: user.id,
      dayOfWeek: d,
      startTime: "08:30",
      endTime: "19:30",
    }))
  );

  await recordAudit({
    session,
    action: "staff_added",
    entityType: "user",
    entityId: user.id,
    after: { name: data.name, role: data.role },
  });

  revalidatePath("/admin/staff");
  return { ok: true as const, userId: user.id, tempPassword };
}

export async function setStaffActive(userId: string, active: boolean) {
  const session = await requireRole("owner", "manager");
  const [before] = await db.select().from(users).where(eq(users.id, userId));
  await db.update(users).set({ active }).where(eq(users.id, userId));
  await db.update(staffProfiles).set({ active }).where(eq(staffProfiles.userId, userId));

  await recordAudit({
    session,
    action: active ? "staff_reactivated" : "staff_deactivated",
    entityType: "user",
    entityId: userId,
    before: { active: before?.active },
    after: { active },
  });

  revalidatePath("/admin/staff");
  return { ok: true as const };
}

export async function updateStylistServices(stylistId: string, serviceIds: string[]) {
  const session = await requireRole("owner", "manager");
  await db.delete(stylistServices).where(eq(stylistServices.stylistId, stylistId));
  if (serviceIds.length) {
    await db.insert(stylistServices).values(serviceIds.map((serviceId) => ({ stylistId, serviceId })));
  }

  await recordAudit({
    session,
    action: "stylist_services_updated",
    entityType: "user",
    entityId: stylistId,
    after: { serviceIds },
  });

  revalidatePath("/admin/staff");
  return { ok: true as const };
}

export async function updateAvailability(params: {
  stylistId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}) {
  const session = await requireRole("owner", "manager");
  const [existing] = await db
    .select()
    .from(availability)
    .where(and(eq(availability.stylistId, params.stylistId), eq(availability.dayOfWeek, params.dayOfWeek)));

  if (existing) {
    await db
      .update(availability)
      .set({ startTime: params.startTime, endTime: params.endTime, active: params.active })
      .where(eq(availability.id, existing.id));
  } else {
    await db.insert(availability).values(params);
  }

  await recordAudit({
    session,
    action: "availability_updated",
    entityType: "availability",
    entityId: params.stylistId,
    after: params,
  });

  revalidatePath("/admin/staff");
  return { ok: true as const };
}
