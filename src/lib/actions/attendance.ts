"use server";

import { db } from "@/db";
import { attendance, attendanceEvents, salonSettings, staffProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { distanceMeters } from "@/lib/geo";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getOrCreateAttendanceRow(staffId: string) {
  const date = today();
  const [existing] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.staffId, staffId), eq(attendance.date, date)));
  if (existing) return existing;

  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, staffId));

  const [created] = await db
    .insert(attendance)
    .values({
      staffId,
      date,
      scheduledStart: profile?.scheduledStart ?? "08:30",
      status: "not_checked_in",
    })
    .returning();
  return created;
}

/** Called automatically on login for staff accounts. This is NOT physical attendance. */
export async function recordLogin(staffId: string) {
  const row = await getOrCreateAttendanceRow(staffId);
  if (row.loginAt) return; // already logged in today
  const now = new Date().toISOString();
  await db.update(attendance).set({ loginAt: now }).where(eq(attendance.id, row.id));
  await db.insert(attendanceEvents).values({
    attendanceId: row.id,
    type: "login",
    locationLat: null,
    locationLng: null,
    verified: null,
  });
}

export async function checkIn(params: { lat?: number; lng?: number; locationDenied?: boolean }) {
  const session = await requireRole("stylist", "manager", "owner", "admin");
  const row = await getOrCreateAttendanceRow(session.userId);
  if (row.checkInAt) {
    return { ok: false as const, error: "You've already checked in today." };
  }

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));

  let verified: boolean | null = null;
  if (params.lat != null && params.lng != null && settings?.latitude != null && settings?.longitude != null) {
    const dist = distanceMeters(params.lat, params.lng, settings.latitude, settings.longitude);
    verified = dist <= (settings.checkInRadiusMeters ?? 100);
  } else {
    verified = false; // location unavailable/denied -> recorded as unverified self check-in
  }

  const now = new Date();
  const scheduled = row.scheduledStart ?? "08:30";
  const [schH, schM] = scheduled.split(":").map(Number);
  const scheduledDate = new Date(now);
  scheduledDate.setHours(schH, schM, 0, 0);
  const graceMinutes = settings?.attendanceGracePeriodMinutes ?? 10;
  const isLate = now.getTime() > scheduledDate.getTime() + graceMinutes * 60000;

  await db
    .update(attendance)
    .set({
      checkInAt: now.toISOString(),
      checkInVerified: verified,
      status: isLate ? "late" : "on_time",
    })
    .where(eq(attendance.id, row.id));

  await db.insert(attendanceEvents).values({
    attendanceId: row.id,
    type: "check_in",
    locationLat: params.lat ?? null,
    locationLng: params.lng ?? null,
    verified,
  });

  await recordAudit({
    session,
    action: "staff_check_in",
    entityType: "attendance",
    entityId: row.id,
    after: { verified, status: isLate ? "late" : "on_time" },
  });

  revalidatePath("/stylist");
  revalidatePath("/admin");
  return { ok: true as const, verified, late: isLate };
}

export async function checkOut(params: { lat?: number; lng?: number }) {
  const session = await requireRole("stylist", "manager", "owner", "admin");
  const row = await getOrCreateAttendanceRow(session.userId);
  if (!row.checkInAt) {
    return { ok: false as const, error: "You need to check in before checking out." };
  }
  if (row.checkOutAt) {
    return { ok: false as const, error: "You've already checked out today." };
  }

  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  let verified: boolean | null = null;
  if (params.lat != null && params.lng != null && settings?.latitude != null && settings?.longitude != null) {
    const dist = distanceMeters(params.lat, params.lng, settings.latitude, settings.longitude);
    verified = dist <= (settings.checkInRadiusMeters ?? 100);
  } else {
    verified = false;
  }

  const now = new Date().toISOString();
  await db
    .update(attendance)
    .set({ checkOutAt: now, checkOutVerified: verified, status: "checked_out" })
    .where(eq(attendance.id, row.id));

  await db.insert(attendanceEvents).values({
    attendanceId: row.id,
    type: "check_out",
    locationLat: params.lat ?? null,
    locationLng: params.lng ?? null,
    verified,
  });

  revalidatePath("/stylist");
  revalidatePath("/admin");
  return { ok: true as const, verified };
}

/** Manager/owner manual correction of an attendance record — always leaves an audit trail. */
export async function correctAttendance(params: {
  attendanceId: string;
  field: "status" | "checkInAt" | "checkOutAt";
  newValue: string;
  reason: string;
}) {
  const session = await requireRole("manager", "owner", "admin");
  const [row] = await db.select().from(attendance).where(eq(attendance.id, params.attendanceId));
  if (!row) return { ok: false as const, error: "Attendance record not found." };

  const originalValue = String(row[params.field as keyof typeof row] ?? "");

  await db
    .update(attendance)
    .set({ [params.field]: params.newValue } as never)
    .where(eq(attendance.id, params.attendanceId));

  await db.insert(attendanceEvents).values({
    attendanceId: params.attendanceId,
    type: "manual_correction",
    correctedByUserId: session.userId,
    originalValue,
    newValue: params.newValue,
    reason: params.reason,
    verified: null,
  });

  await recordAudit({
    session,
    action: "attendance_manual_correction",
    entityType: "attendance",
    entityId: params.attendanceId,
    before: { [params.field]: originalValue },
    after: { [params.field]: params.newValue, reason: params.reason },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}
