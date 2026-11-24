"use server";

import { db } from "@/db";
import { appointments, payments, paymentProofs, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSession, requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deriveProofAmount, phoneMatchesAppointment, type ProofAmountType } from "@/lib/payment-proofs";
import { recomputeAppointmentPaymentState } from "@/lib/actions/payments";

const submitSchema = z.object({
  appointmentId: z.string().min(1),
  customerPhone: z.string().min(9).max(30),
  proofId: z.string().uuid(),
});

function isAuthorizedCustomer(
  appointment: typeof appointments.$inferSelect,
  session: Awaited<ReturnType<typeof getSession>>,
  phone: string,
) {
  const owns = session?.role === "customer" && appointment.customerId === session.userId;
  return owns || phoneMatchesAppointment(appointment.customerPhone, phone);
}

export async function submitMobileMoneyProof(input: z.infer<typeof submitSchema>) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the booking details and selected proof." };
  const data = parsed.data;
  const { checkRateLimit } = await import("@/lib/rate-limit");
  if (!checkRateLimit(`proof-submit:${data.appointmentId}`, 4, 10 * 60 * 1000).allowed) {
    return { ok: false as const, error: "Too many proof submissions for this booking. Please wait a few minutes." };
  }

  const session = await getSession();
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
  if (!appointment || appointment.source !== "online" || !isAuthorizedCustomer(appointment, session, data.customerPhone)) {
    return { ok: false as const, error: "We couldn't verify this booking." };
  }
  if (appointment.status !== "pending") {
    return { ok: false as const, error: "This booking is no longer awaiting payment review." };
  }

  const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, data.proofId));
  if (!proof || proof.appointmentId !== appointment.id) {
    return { ok: false as const, error: "The selected payment proof is not available for this booking." };
  }
  if (proof.status !== "uploaded") {
    return { ok: false as const, error: "This proof has already been submitted or reviewed." };
  }

  const amountType = proof.amountType as ProofAmountType;
  const amount = deriveProofAmount(appointment, amountType);
  if (amount == null || Math.abs(amount - proof.amount) > 0.001) {
    return { ok: false as const, error: "The amount due has changed. Please upload a new proof for the current amount." };
  }

  // A unique proof reference is the idempotency guard for concurrent retries.
  const transactionReference = `payment-proof:${proof.id}`;
  const [alreadyCreated] = await db.select().from(payments).where(eq(payments.transactionReference, transactionReference));
  if (alreadyCreated) return { ok: false as const, error: "This payment proof has already been submitted." };

  const existingPending = await db.select({ id: payments.id }).from(payments).where(
    and(eq(payments.appointmentId, appointment.id), eq(payments.status, "pending")),
  );
  if (existingPending.length > 0) {
    return { ok: false as const, error: "A payment for this booking is already awaiting review. Please wait for the salon." };
  }

  let payment: typeof payments.$inferSelect;
  try {
    const [created] = await db.insert(payments).values({
      appointmentId: appointment.id,
      amount,
      method: "mobile_money",
      status: "pending",
      provider: "manual",
      paymentType: amountType,
      transactionReference,
      recordedByUserId: session?.userId ?? null,
      note: `Submitted mobile-money transfer proof ${proof.id}`,
    }).returning();
    payment = created;
  } catch {
    return { ok: false as const, error: "This proof may already have been submitted. Refresh the page and check its status." };
  }

  const [marked] = await db.update(paymentProofs).set({
    status: "pending",
    paymentId: payment.id,
    submittedByUserId: session?.userId ?? null,
    submittedAt: new Date().toISOString(),
  }).where(and(eq(paymentProofs.id, proof.id), eq(paymentProofs.status, "uploaded"))).returning({ id: paymentProofs.id });

  await recordAudit({
    session,
    action: "mobile_money_proof_submitted",
    entityType: "payment_proof",
    entityId: proof.id,
    after: { appointmentId: appointment.id, paymentId: payment.id, amountType, amount, status: "pending" },
  });

  if (!marked) {
    return { ok: false as const, error: "This proof was submitted elsewhere. Please refresh the page." };
  }

  const recipients = new Set<string>();
  if (appointment.stylistId) recipients.add(appointment.stylistId);
  const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["manager", "owner", "admin"]));
  for (const admin of admins) recipients.add(admin.id);
  await Promise.all(Array.from(recipients).map((userId) => notify({
    userId,
    type: "payment_proof_submitted",
    title: "Mobile Money proof submitted",
    body: `${appointment.customerName} submitted GH₵${amount.toFixed(2)} proof for ${appointment.scheduledDate} at ${appointment.scheduledTime}. Review is required.`,
    relatedAppointmentId: appointment.id,
    url: "/admin/payment-review",
  })));

  revalidatePath("/admin/payment-review");
  revalidatePath("/admin");
  revalidatePath(`/account/appointments/${appointment.id}`);
  return { ok: true as const, status: "pending" as const };
}

const reviewSchema = z.object({
  proofId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function reviewMobileMoneyProof(input: z.infer<typeof reviewSchema>) {
  const session = await requireRole("manager", "owner", "admin");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check your review decision." };
  const data = parsed.data;
  if (data.decision === "reject" && !data.note?.trim()) {
    return { ok: false as const, error: "Add a short reason before rejecting this proof." };
  }
  const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, data.proofId));
  if (!proof || proof.status !== "pending" || !proof.paymentId) {
    return { ok: false as const, error: "This proof is no longer awaiting review." };
  }
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, proof.appointmentId));
  const [payment] = await db.select().from(payments).where(eq(payments.id, proof.paymentId));
  if (!appointment || !payment || payment.status !== "pending" || payment.appointmentId !== appointment.id) {
    return { ok: false as const, error: "The linked payment is no longer awaiting review." };
  }
  if (data.decision === "approve" && ["cancelled", "completed", "no_show"].includes(appointment.status)) {
    return { ok: false as const, error: "This appointment can no longer accept payment approval." };
  }
  if (data.decision === "approve" && payment.amount > appointment.balanceDue + 0.001) {
    return { ok: false as const, error: "The submitted amount now exceeds the outstanding balance. Reject this proof and request a new payment." };
  }

  const nextPaymentStatus = data.decision === "approve" ? "paid" : "failed";
  const [transitioned] = await db.update(payments).set({ status: nextPaymentStatus, recordedByUserId: session.userId }).where(
    and(eq(payments.id, payment.id), eq(payments.status, "pending")),
  ).returning({ id: payments.id });
  if (!transitioned) return { ok: false as const, error: "This proof was reviewed by another staff member." };

  const nextProofStatus = data.decision === "approve" ? "approved" : "rejected";
  await db.update(paymentProofs).set({
    status: nextProofStatus,
    reviewedByUserId: session.userId,
    reviewedAt: new Date().toISOString(),
    reviewNote: data.note || null,
  }).where(and(eq(paymentProofs.id, proof.id), eq(paymentProofs.status, "pending")));

  if (data.decision === "approve") await recomputeAppointmentPaymentState(appointment.id);

  await recordAudit({
    session,
    action: data.decision === "approve" ? "mobile_money_proof_approved" : "mobile_money_proof_rejected",
    entityType: "payment_proof",
    entityId: proof.id,
    before: { status: proof.status, paymentStatus: payment.status },
    after: { status: nextProofStatus, paymentStatus: nextPaymentStatus, paymentId: payment.id, note: data.note || null },
  });

  if (appointment.customerId) {
    await notify({
      userId: appointment.customerId,
      type: data.decision === "approve" ? "payment_received" : "payment_failed",
      title: data.decision === "approve" ? "Payment proof approved" : "Payment proof needs attention",
      body: data.decision === "approve"
        ? `Your GH₵${payment.amount.toFixed(2)} Mobile Money payment was approved.${appointment.depositRequired > 0 && payment.amount < appointment.priceEstimate ? " Your booking will be confirmed once the deposit requirement is met." : ""}`
        : `Your payment proof was not approved.${data.note ? ` ${data.note}` : " Please submit a new screenshot."}`,
      relatedAppointmentId: appointment.id,
      url: `/account/appointments/${appointment.id}`,
    });
  }

  revalidatePath("/admin/payment-review");
  revalidatePath("/admin");
  revalidatePath(`/account/appointments/${appointment.id}`);
  return { ok: true as const, status: nextProofStatus };
}

export async function listPendingMobileMoneyProofs() {
  await requireRole("manager", "owner", "admin");
  return db.select({
    id: paymentProofs.id,
    appointmentId: paymentProofs.appointmentId,
    amountType: paymentProofs.amountType,
    amount: paymentProofs.amount,
    mimeType: paymentProofs.mimeType,
    submittedAt: paymentProofs.submittedAt,
    customerName: appointments.customerName,
    customerPhone: appointments.customerPhone,
    stylistName: users.name,
    scheduledDate: appointments.scheduledDate,
    scheduledTime: appointments.scheduledTime,
    appointmentStatus: appointments.status,
  }).from(paymentProofs).innerJoin(appointments, eq(paymentProofs.appointmentId, appointments.id))
    .leftJoin(users, eq(appointments.stylistId, users.id))
    .where(eq(paymentProofs.status, "pending"));
}
