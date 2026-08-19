"use server";

import { db } from "@/db";
import { appointments, appointmentStatusHistory, completedWork, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";

export async function startService(appointmentId: string) {
  const session = await requireRole("stylist", "manager", "owner");
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (session.role === "stylist" && appt.stylistId !== session.userId) {
    return { ok: false as const, error: "You don't have permission to perform this action." };
  }
  if (!["arrived", "confirmed", "pending"].includes(appt.status)) {
    return { ok: false as const, error: "This appointment can't be started right now." };
  }

  const now = new Date().toISOString();
  await db
    .update(appointments)
    .set({ status: "in_service", serviceStartedAt: now })
    .where(eq(appointments.id, appointmentId));

  await db.insert(appointmentStatusHistory).values({
    appointmentId,
    status: "in_service",
    changedByUserId: session.userId,
    changedByRole: session.role,
  });

  await recordAudit({
    session,
    action: "service_started",
    entityType: "appointment",
    entityId: appointmentId,
  });

  revalidatePath("/stylist");
  revalidatePath("/admin");
  return { ok: true as const };
}

function inferMediaType(url: string): "image" | "video" {
  return /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image";
}

export async function completeService(params: { appointmentId: string; mediaUrls?: string[] }) {
  const session = await requireRole("stylist", "manager", "owner");
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, params.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (session.role === "stylist" && appt.stylistId !== session.userId) {
    return { ok: false as const, error: "You don't have permission to perform this action." };
  }
  if (appt.status !== "in_service") {
    return { ok: false as const, error: "This service hasn't been started yet." };
  }

  const now = new Date().toISOString();
  await db
    .update(appointments)
    .set({ status: "completed", serviceCompletedAt: now })
    .where(eq(appointments.id, params.appointmentId));

  await db.insert(appointmentStatusHistory).values({
    appointmentId: params.appointmentId,
    status: "completed",
    changedByUserId: session.userId,
    changedByRole: session.role,
  });

  if (params.mediaUrls?.length) {
    await db.insert(completedWork).values(
      params.mediaUrls.map((url) => ({
        appointmentId: params.appointmentId,
        photoUrl: url,
        mediaType: inferMediaType(url),
        uploadedByUserId: session.userId,
        reviewStatus: "pending_review" as const,
      }))
    );
  }

  await recordAudit({
    session,
    action: "service_completed",
    entityType: "appointment",
    entityId: params.appointmentId,
  });

  const admins = await db.select().from(users).where(inArray(users.role, ["manager", "owner"]));
  await Promise.all(
    admins.map((a) =>
      notify({
        userId: a.id,
        type: "service_awaiting_verification",
        title: "Service awaiting verification",
        body: `${appt.customerName}'s service is complete and awaiting review.`,
        relatedAppointmentId: params.appointmentId,
      })
    )
  );

  if (appt.customerId) {
    await notify({
      userId: appt.customerId,
      type: "service_completed",
      title: "Your service is complete",
      body: "We'd love to hear about your experience. Please leave a review.",
      relatedAppointmentId: params.appointmentId,
    });
  }

  revalidatePath("/stylist");
  revalidatePath("/admin");
  revalidatePath("/account");
  return { ok: true as const };
}

export async function uploadCompletedWork(params: { appointmentId: string; mediaUrls: string[] }) {
  const session = await requireRole("stylist", "manager", "owner");
  if (!params.mediaUrls.length) return { ok: false as const, error: "No files provided." };

  await db.insert(completedWork).values(
    params.mediaUrls.map((url) => ({
      appointmentId: params.appointmentId,
      photoUrl: url,
      mediaType: inferMediaType(url),
      uploadedByUserId: session.userId,
      reviewStatus: "pending_review" as const,
    }))
  );

  await recordAudit({
    session,
    action: "completed_work_uploaded",
    entityType: "appointment",
    entityId: params.appointmentId,
    after: { count: params.mediaUrls.length },
  });

  revalidatePath("/admin");
  revalidatePath(`/stylist/appointments/${params.appointmentId}`);
  return { ok: true as const };
}

export async function reviewCompletedWork(params: {
  completedWorkId: string;
  status: "approved" | "needs_review" | "issue_reported";
  note?: string;
}) {
  const session = await requireRole("manager", "owner");
  await db
    .update(completedWork)
    .set({
      reviewStatus: params.status,
      reviewedByUserId: session.userId,
      reviewNote: params.note ?? null,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(completedWork.id, params.completedWorkId));

  await recordAudit({
    session,
    action: "completed_work_reviewed",
    entityType: "completed_work",
    entityId: params.completedWorkId,
    after: { status: params.status, note: params.note },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}
