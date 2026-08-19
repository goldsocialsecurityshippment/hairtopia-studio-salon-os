"use server";

import { db } from "@/db";
import { payments, appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const recordPaymentSchema = z.object({
  appointmentId: z.string(),
  amount: z.number().positive(),
  method: z.enum(["cash", "mobile_money", "card", "bank_transfer"]),
  status: z.enum(["pending", "partial", "paid", "refunded", "disputed"]),
  note: z.string().optional(),
});

/**
 * Records a payment against an appointment. This does NOT move real money —
 * it is the bookkeeping layer. Wiring a live Paystack/Mobile Money charge
 * requires the salon's own API credentials plugged in at deploy time.
 */
export async function recordPayment(input: z.infer<typeof recordPaymentSchema>) {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Please check the payment details." };
  const data = parsed.data;
  const session = await requireRole("manager", "owner", "stylist");

  if (session.role === "stylist") {
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, data.appointmentId));
    if (!appt || appt.stylistId !== session.userId) {
      return { ok: false as const, error: "You can only confirm payment for your own appointments." };
    }
  }

  await db.insert(payments).values({
    appointmentId: data.appointmentId,
    amount: data.amount,
    method: data.method,
    status: data.status,
    recordedByUserId: session.userId,
    note: data.note || null,
  });

  await db
    .update(appointments)
    .set({ paymentStatus: data.status })
    .where(eq(appointments.id, data.appointmentId));

  await recordAudit({
    session,
    action: "payment_recorded",
    entityType: "appointment",
    entityId: data.appointmentId,
    after: data,
  });

  revalidatePath("/admin");
  revalidatePath("/stylist");
  return { ok: true as const };
}
