"use server";

import { db } from "@/db";
import { reviews, appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const reviewSchema = z.object({
  appointmentId: z.string(),
  overallRating: z.number().min(1).max(5),
  qualityRating: z.number().min(1).max(5).optional(),
  professionalismRating: z.number().min(1).max(5).optional(),
  communicationRating: z.number().min(1).max(5).optional(),
  respectfulnessRating: z.number().min(1).max(5).optional(),
  punctualityRating: z.number().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export async function submitReview(input: z.infer<typeof reviewSchema>) {
  const { headers } = await import("next/headers");
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(clientKeyFromHeaders(await headers(), "review"), 10, 15 * 60 * 1000);
  if (!rl.allowed) return { ok: false as const, error: "Too many review submissions from this connection. Please wait a few minutes." };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please provide a valid rating." };
  const data = parsed.data;
  const session = await getSession();

  const [appt] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };
  if (appt.status !== "completed") {
    return { ok: false as const, error: "You can only review completed appointments." };
  }

  const existing = await db.select().from(reviews).where(eq(reviews.appointmentId, data.appointmentId));
  if (existing.length > 0) {
    return { ok: false as const, error: "You've already reviewed this appointment." };
  }

  await db.insert(reviews).values({
    appointmentId: data.appointmentId,
    customerId: session?.userId ?? appt.customerId,
    overallRating: data.overallRating,
    qualityRating: data.qualityRating ?? null,
    professionalismRating: data.professionalismRating ?? null,
    communicationRating: data.communicationRating ?? null,
    respectfulnessRating: data.respectfulnessRating ?? null,
    punctualityRating: data.punctualityRating ?? null,
    comment: data.comment || null,
  });

  await recordAudit({
    session,
    action: "review_submitted",
    entityType: "appointment",
    entityId: data.appointmentId,
    after: { overallRating: data.overallRating },
  });

  revalidatePath("/account");
  revalidatePath("/admin");
  return { ok: true as const };
}

const updateReviewSchema = z.object({
  reviewId: z.string(),
  overallRating: z.number().min(1).max(5),
  qualityRating: z.number().min(1).max(5).optional(),
  professionalismRating: z.number().min(1).max(5).optional(),
  communicationRating: z.number().min(1).max(5).optional(),
  respectfulnessRating: z.number().min(1).max(5).optional(),
  punctualityRating: z.number().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

/** Customer can edit their own review after submitting it. */
export async function updateReview(input: z.infer<typeof updateReviewSchema>) {
  const parsed = updateReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please provide a valid rating." };
  const data = parsed.data;
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Please sign in to edit your review." };

  const [existing] = await db.select().from(reviews).where(eq(reviews.id, data.reviewId));
  if (!existing) return { ok: false as const, error: "Review not found." };
  if (existing.customerId !== session.userId) {
    return { ok: false as const, error: "You can only edit your own review." };
  }

  await db
    .update(reviews)
    .set({
      overallRating: data.overallRating,
      qualityRating: data.qualityRating ?? null,
      professionalismRating: data.professionalismRating ?? null,
      communicationRating: data.communicationRating ?? null,
      respectfulnessRating: data.respectfulnessRating ?? null,
      punctualityRating: data.punctualityRating ?? null,
      comment: data.comment || null,
    })
    .where(eq(reviews.id, data.reviewId));

  await recordAudit({
    session,
    action: "review_updated",
    entityType: "review",
    entityId: data.reviewId,
    after: { overallRating: data.overallRating },
  });

  revalidatePath("/account");
  return { ok: true as const };
}

export async function moderateReview(params: { reviewId: string; hidden: boolean }) {
  const session = await requireRole("manager", "owner", "admin");
  await db
    .update(reviews)
    .set({ hidden: params.hidden, moderated: true })
    .where(eq(reviews.id, params.reviewId));

  await recordAudit({
    session,
    action: "review_moderated",
    entityType: "review",
    entityId: params.reviewId,
    after: { hidden: params.hidden },
  });

  revalidatePath("/admin");
  return { ok: true as const };
}
