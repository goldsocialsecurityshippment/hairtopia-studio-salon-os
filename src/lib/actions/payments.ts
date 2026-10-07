"use server";

import { db } from "@/db";
import { payments, appointments } from "@/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { requireRole, getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPaymentProvider } from "@/lib/payments/provider";

const recordPaymentSchema = z.object({
  appointmentId: z.string(),
  amount: z.number().positive(),
  method: z.enum(["cash", "mobile_money", "card", "bank_transfer"]),
  paymentType: z.enum(["deposit", "final", "full"]).default("full"),
  note: z.string().optional(),
});

/**
 * Records a payment against an appointment through the provider abstraction.
 * For manual methods (cash/card-in-person/bank transfer) this is
 * staff-confirmed bookkeeping and is production-ready today. For mobile
 * money, this creates a pending provider transaction — it is NOT marked
 * successful until a verified provider callback/poll confirms it (see
 * confirmMomoCallback below). The browser never gets to declare success.
 */
export async function recordPayment(input: z.infer<typeof recordPaymentSchema>) {
  const { checkRateLimit } = await import("@/lib/rate-limit");
  // Keyed on the appointment, not the caller — this is what actually stops
  // a runaway double-submit/duplicate-charge attempt against one booking,
  // regardless of which staff account or device it comes from.
  if (!checkRateLimit(`payment:${input.appointmentId}`, 5, 60 * 1000).allowed) {
    return { ok: false as const, error: "Too many payment attempts for this appointment in a short time. Please wait a moment." };
  }

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the payment details." };
  const data = parsed.data;
  const session = await requireRole("manager", "owner", "admin", "stylist");

  const [appt] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };

  if (session.role === "stylist" && appt.stylistId !== session.userId) {
    return { ok: false as const, error: "You can only confirm payment for your own appointments." };
  }
  if (data.amount > appt.balanceDue) {
    return { ok: false as const, error: `This exceeds the outstanding balance of GH₵${appt.balanceDue.toFixed(2)} — no overpayment is allowed.` };
  }

  const provider = getPaymentProvider(data.method);
  let authorization;
  try {
    authorization = await provider.createPayment({
      appointmentId: data.appointmentId,
      amount: data.amount,
      currency: "GHS",
      paymentType: data.paymentType,
      customerPhone: appt.customerPhone,
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Payment provider error." };
  }

  const status = authorization.status === "successful" ? "paid" : authorization.status === "failed" ? "failed" : "pending";

  const [payment] = await db
    .insert(payments)
    .values({
      appointmentId: data.appointmentId,
      amount: data.amount,
      method: data.method,
      status,
      provider: provider.name,
      paymentType: data.paymentType,
      transactionReference: authorization.transactionReference,
      externalId: authorization.externalId,
      providerTransactionId: authorization.providerTransactionId ?? null,
      recordedByUserId: session.userId,
      note: data.note || null,
    })
    .returning();

  // Only a SUCCESSFUL payment moves the deposit/balance/appointment state —
  // a pending MoMo request does not.
  if (status === "paid") {
    await recomputeAppointmentPaymentState(appt.id);
  }

  await recordAudit({
    session,
    action: "payment_recorded",
    entityType: "payment",
    entityId: payment.id,
    after: { ...data, status, transactionReference: authorization.transactionReference },
  });

  if (status === "paid") {
    await notify({
      userId: appt.stylistId || session.userId,
      type: "payment_received",
      title: "Payment received",
      body: `GH₵${data.amount} ${data.paymentType} payment recorded for ${appt.customerName}.`,
      relatedAppointmentId: appt.id,
    });
  } else if (status === "failed") {
    await notify({
      userId: session.userId,
      type: "payment_failed",
      title: "Payment failed",
      body: `The ${data.method} payment attempt for ${appt.customerName} failed.`,
      relatedAppointmentId: appt.id,
    });
    if (appt.customerId) {
      await notify({
        userId: appt.customerId,
        type: "payment_failed",
        title: "Payment failed",
        body: `Your ${data.method} payment attempt for the ${appt.scheduledDate} ${appt.scheduledTime} appointment didn't go through. Please try again.`,
        relatedAppointmentId: appt.id,
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/stylist");
  revalidatePath(`/account/appointments/${appt.id}`);
  return { ok: true as const, status, transactionReference: authorization.transactionReference };
}

/**
 * Recomputes an appointment's deposit/balance/status from the actual set
 * of successful payments on record, rather than incrementally patching
 * numbers on each call. Incremental math was the source of several real
 * bugs the test suite caught: a too-small deposit incorrectly confirming
 * the booking, a "full" payment NOT confirming it (the old code only
 * special-cased paymentType === "deposit"), and sequential "final"
 * payments not accumulating because nothing summed prior ones. Recomputing
 * from the source of truth (the payments table) sidesteps all three at
 * once, and is exactly what makes a refund correctly restore the balance
 * too — a refunded payment simply stops counting as "paid".
 */
async function recomputeAppointmentPaymentState(appointmentId: string) {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return;

  const successfulPayments = await db
    .select()
    .from(payments)
    .where(and(eq(payments.appointmentId, appointmentId), eq(payments.status, "paid")));

  // Net out any partial refund against the payment it belongs to — a fully
  // refunded payment already has status "refunded" and is excluded above;
  // this handles the partial-refund case where status stays "paid" but
  // part of the money has gone back.
  const totalPaid = successfulPayments.reduce((sum, p) => sum + (p.amount - p.refundedAmount), 0);
  const depositPaid = successfulPayments
    .filter((p) => p.paymentType === "deposit")
    .reduce((sum, p) => sum + (p.amount - p.refundedAmount), 0);
  const newBalance = Math.max(0, appt.priceEstimate - totalPaid);
  const newPaymentStatus = newBalance <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

  // Confirms once enough has actually been paid to satisfy the required
  // deposit (or the whole price, if no deposit is configured) —
  // regardless of whether it arrived as one "deposit" payment, several
  // partials, or a single "full" payment.
  const meetsDepositRequirement = appt.depositRequired <= 0 || totalPaid >= appt.depositRequired;
  const newApptStatus = appt.status === "pending" && meetsDepositRequirement ? "confirmed" : appt.status;
  const justConfirmed = appt.status === "pending" && newApptStatus === "confirmed";
  const balanceJustCleared = appt.paymentStatus !== "paid" && newPaymentStatus === "paid";

  await db
    .update(appointments)
    .set({ depositPaid, balanceDue: newBalance, paymentStatus: newPaymentStatus, status: newApptStatus })
    .where(eq(appointments.id, appointmentId));

  // Customer-facing notifications: previously this function only fed
  // STAFF-facing notifications (in recordPayment) — the customer whose
  // money it actually is never heard anything about their own payment.
  // Fixed here, at the single place every successful-payment path
  // (manual, MoMo callback) converges.
  if (appt.customerId && (justConfirmed || balanceJustCleared)) {
    await notify({
      userId: appt.customerId,
      type: "payment_received",
      title: justConfirmed ? "Booking confirmed" : "Payment received",
      body: justConfirmed
        ? `Your deposit was received — your ${appt.scheduledDate} ${appt.scheduledTime} appointment is confirmed.`
        : `Your payment was received. Your ${appt.scheduledDate} ${appt.scheduledTime} appointment is now fully paid.`,
      relatedAppointmentId: appt.id,
    });
  }
}

/**
 * Called from the MTN MoMo webhook route (or an admin manual re-check) once
 * the provider has verified the transaction server-side. This is the ONLY
 * path that can mark a mobile money payment "paid".
 *
 * IDEMPOTENT AND RACE-SAFE: the status transition below is a single
 * UPDATE ... WHERE status NOT IN ('paid','refunded') statement, not a
 * separate SELECT-then-UPDATE. That matters because two identical
 * callbacks (MTN is explicit that duplicates can happen) can arrive as
 * concurrent requests — if we read the status, decided it wasn't 'paid'
 * yet, and then updated it in a second step, both requests could pass the
 * check before either writes, double-applying the financial effect. A
 * single guarded UPDATE closes that window: SQLite serializes writes on
 * this connection, so only the first request's UPDATE can ever match a
 * row in status != 'paid'; the second, whichever order they arrive in,
 * matches zero rows and is a safe no-op that still returns success to
 * MTN (so MTN doesn't retry indefinitely thinking we failed).
 */
export async function confirmMomoCallback(payload: unknown) {
  const { MtnMomoProvider } = await import("@/lib/payments/provider");
  const provider = new MtnMomoProvider();
  const result = await provider.handleCallback(payload);

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionReference, result.transactionReference));
  if (!payment) return { ok: false as const, error: "Unknown transaction reference." };

  const newStatus = result.status === "successful" ? "paid" : result.status === "failed" ? "failed" : "pending";

  // Single atomic, guarded write — this IS the idempotency check, not a
  // preceding `if` on data we read a moment earlier.
  const [updated] = await db
    .update(payments)
    .set({
      status: newStatus,
      providerTransactionId: result.providerTransactionId ?? payment.providerTransactionId,
      providerResponseMetadata: result.raw ? JSON.stringify(result.raw) : payment.providerResponseMetadata,
    })
    .where(and(eq(payments.id, payment.id), notInArray(payments.status, ["paid", "refunded"])))
    .returning();

  if (!updated) {
    // Already finalized by an earlier (possibly duplicate) callback.
    // Safe no-op: do NOT re-apply the financial effect, do NOT re-audit,
    // but still report success so MTN doesn't retry forever.
    await recordAudit({
      session: null,
      action: "momo_callback_duplicate_ignored",
      entityType: "payment",
      entityId: payment.id,
      before: { status: payment.status },
      after: { attemptedStatus: newStatus },
    });
    return { ok: true as const, status: payment.status, duplicate: true as const };
  }

  if (newStatus === "paid") {
    await recomputeAppointmentPaymentState(payment.appointmentId);
  } else if (newStatus === "failed") {
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, payment.appointmentId));
    if (appt?.customerId) {
      await notify({
        userId: appt.customerId,
        type: "payment_failed",
        title: "Payment failed",
        body: `Your mobile money payment for the ${appt.scheduledDate} ${appt.scheduledTime} appointment didn't go through. Please try again.`,
        relatedAppointmentId: appt.id,
      });
    }
  }

  await recordAudit({
    session: null,
    action: "momo_callback_processed",
    entityType: "payment",
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: newStatus },
  });

  revalidatePath("/admin");
  return { ok: true as const, status: newStatus, duplicate: false as const };
}

const customerDepositSchema = z.object({
  appointmentId: z.string(),
  customerPhone: z.string().min(9),
  momoNumber: z.string().min(9),
});

/**
 * Customer-initiated deposit payment via mobile money — distinct from
 * `recordPayment`, which is the STAFF-facing action (cash/card/bank taken
 * in person). This is what the booking wizard's payment step calls: the
 * customer enters the MoMo number to receive the prompt-to-pay on, and the
 * booking is NOT treated as paid/confirmed here — only a verified provider
 * callback can do that (see confirmMomoCallback). Until real MTN
 * credentials are configured, this correctly fails with a clear
 * "not configured" error rather than faking a successful prompt.
 *
 * Authorization: allowed for the appointment's own logged-in customer, or
 * for a guest booking when the phone number supplied matches the
 * appointment's recorded phone (the same fact a guest already had to know
 * to have booked it in the first place) — never for an arbitrary caller.
 */
export async function initiateCustomerDeposit(input: z.infer<typeof customerDepositSchema>) {
  const parsed = customerDepositSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the details." };
  const data = parsed.data;

  const { checkRateLimit } = await import("@/lib/rate-limit");
  if (!checkRateLimit(`customer-deposit:${data.appointmentId}`, 5, 5 * 60 * 1000).allowed) {
    return { ok: false as const, error: "Too many payment attempts for this booking. Please wait a few minutes." };
  }

  const session = await getSession();
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
  if (!appt) return { ok: false as const, error: "Appointment not found." };

  const isOwner = session?.role === "customer" && appt.customerId === session.userId;
  const phoneMatches = appt.customerPhone.replace(/\D/g, "").endsWith(data.customerPhone.replace(/\D/g, "").slice(-9));
  if (!isOwner && !phoneMatches) {
    return { ok: false as const, error: "We couldn't verify this booking against the details provided." };
  }

  if (appt.depositRequired <= 0) {
    return { ok: false as const, error: "No deposit is required for this booking." };
  }
  if (appt.depositPaid >= appt.depositRequired) {
    return { ok: false as const, error: "The deposit for this booking has already been paid." };
  }

  const provider = getPaymentProvider("mobile_money");
  let authorization;
  try {
    authorization = await provider.createPayment({
      appointmentId: appt.id,
      amount: appt.depositRequired,
      currency: "GHS",
      paymentType: "deposit",
      customerPhone: data.momoNumber,
    });
  } catch (err) {
    // Honest failure — no fake "prompt sent" when MoMo isn't configured.
    return { ok: false as const, error: err instanceof Error ? err.message : "Payment could not be started." };
  }

  const status = authorization.status === "successful" ? "paid" : authorization.status === "failed" ? "failed" : "pending";

  const [payment] = await db
    .insert(payments)
    .values({
      appointmentId: appt.id,
      amount: appt.depositRequired,
      method: "mobile_money",
      status,
      provider: provider.name,
      paymentType: "deposit",
      transactionReference: authorization.transactionReference,
      externalId: authorization.externalId,
      recordedByUserId: session?.userId ?? null,
      note: `Customer-initiated MoMo deposit to ${data.momoNumber}`,
    })
    .returning();

  if (status === "paid") {
    await recomputeAppointmentPaymentState(appt.id);
  }

  await recordAudit({
    session,
    action: "customer_deposit_initiated",
    entityType: "payment",
    entityId: payment.id,
    after: { status, transactionReference: authorization.transactionReference },
  });

  revalidatePath(`/account/appointments/${appt.id}`);
  return { ok: true as const, status, transactionReference: authorization.transactionReference };
}

export async function getPaymentStatusForAppointment(appointmentId: string) {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  if (!appt) return null;
  return { status: appt.status, depositPaid: appt.depositPaid, depositRequired: appt.depositRequired, balanceDue: appt.balanceDue };
}

const refundSchema = z.object({
  paymentId: z.string(),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

export async function refundPayment(input: z.infer<typeof refundSchema>) {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the refund details." };
  const session = await requireRole("manager", "owner", "admin");

  const [payment] = await db.select().from(payments).where(eq(payments.id, parsed.data.paymentId));
  if (!payment) return { ok: false as const, error: "Payment not found." };
  if (payment.status !== "paid") {
    return { ok: false as const, error: "Only a successfully paid payment can be refunded." };
  }
  const alreadyRefunded = payment.refundedAmount;
  const refundable = payment.amount - alreadyRefunded;
  if (parsed.data.amount > refundable) {
    return { ok: false as const, error: `Only GH₵${refundable.toFixed(2)} of this payment can still be refunded.` };
  }

  const provider = getPaymentProvider(payment.method);
  const result = await provider.refundPayment(payment.transactionReference ?? payment.id, parsed.data.amount);

  if (result.status === "successful") {
    const newRefundedAmount = alreadyRefunded + parsed.data.amount;
    const fullyRefunded = newRefundedAmount >= payment.amount;
    await db
      .update(payments)
      .set({
        refundedAmount: newRefundedAmount,
        refundStatus: fullyRefunded ? "refunded" : "processing",
        // A FULLY refunded payment stops counting as "paid" at all; a
        // PARTIALLY refunded one stays "paid" — recomputeAppointmentPaymentState
        // nets out refundedAmount either way, so the balance is correct
        // in both cases.
        status: fullyRefunded ? "refunded" : "paid",
      })
      .where(eq(payments.id, payment.id));

    // This is what actually restores the appointment's balance/deposit —
    // previously missing entirely: a "successful" refund updated only the
    // payment row and never touched the appointment at all.
    await recomputeAppointmentPaymentState(payment.appointmentId);
  } else {
    await db.update(payments).set({ refundStatus: "processing" }).where(eq(payments.id, payment.id));
  }

  await recordAudit({
    session,
    action: "payment_refund_initiated",
    entityType: "payment",
    entityId: payment.id,
    before: { refundedAmount: alreadyRefunded },
    after: { refundedAmount: alreadyRefunded + (result.status === "successful" ? parsed.data.amount : 0), reason: parsed.data.reason },
  });

  revalidatePath("/admin");
  return { ok: true as const, status: result.status };
}
