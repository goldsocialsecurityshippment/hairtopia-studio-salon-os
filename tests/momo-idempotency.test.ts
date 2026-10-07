import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { users, services, serviceCategories, appointments, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { confirmMomoCallback } from "@/lib/actions/payments";

/**
 * This is the test for the audit's #1 finding: a duplicate MTN MoMo
 * callback must NEVER double-apply a deposit/balance change. It directly
 * exercises the atomic UPDATE...WHERE guard in confirmMomoCallback.
 */
describe("MoMo callback idempotency (financial correctness)", () => {
  let appointmentId: string;
  let transactionReference: string;

  beforeAll(async () => {
    process.env.MTN_MOMO_API_USER = "test";
    process.env.MTN_MOMO_API_KEY = "test";
    process.env.MTN_MOMO_SUBSCRIPTION_KEY = "test";

    const [customer] = await db.insert(users).values({
      role: "customer",
      name: "Idempotency Test Customer",
      phone: `+233${Math.floor(Math.random() * 900000000 + 100000000)}`,
      passwordHash: "x",
    }).returning();

    const [category] = await db.insert(serviceCategories).values({ name: "Test Category " + Math.random() }).returning();
    const [service] = await db.insert(services).values({
      categoryId: category.id,
      name: "Test Service",
      priceMin: 250,
      durationMinutes: 60,
    }).returning();

    const [appt] = await db.insert(appointments).values({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone!,
      serviceId: service.id,
      scheduledDate: "2027-01-01",
      scheduledTime: "10:00",
      durationMinutes: 60,
      priceEstimate: 250,
      status: "pending",
      depositRequired: 100,
      depositPaid: 0,
      balanceDue: 250,
    }).returning();
    appointmentId = appt.id;

    transactionReference = `TEST-REF-${Date.now()}`;
    await db.insert(payments).values({
      appointmentId,
      amount: 100,
      method: "mobile_money",
      status: "pending",
      provider: "mtn_momo",
      paymentType: "deposit",
      transactionReference,
      externalId: transactionReference,
    });
  });

  it("applies the deposit exactly once even when the SAME callback is received twice", async () => {
    const payload = { referenceId: transactionReference, status: "SUCCESSFUL", financialTransactionId: "FT123" };

    const first = await confirmMomoCallback(payload);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.duplicate).toBe(false);

    const afterFirst = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)))[0];
    expect(afterFirst.depositPaid).toBe(100);
    expect(afterFirst.balanceDue).toBe(150);

    // The exact scenario the audit flagged: MTN sends the identical
    // callback a second time.
    const second = await confirmMomoCallback(payload);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.duplicate).toBe(true);

    const afterSecond = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)))[0];
    // THE CRITICAL ASSERTION: still 100, not 200. Still 150, not 50.
    expect(afterSecond.depositPaid).toBe(100);
    expect(afterSecond.balanceDue).toBe(150);

    // And a third time, for good measure.
    await confirmMomoCallback(payload);
    const afterThird = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)))[0];
    expect(afterThird.depositPaid).toBe(100);
  });

  it("does not create duplicate payment rows for the same transaction reference", async () => {
    const rows = await db.select().from(payments).where(eq(payments.transactionReference, transactionReference));
    expect(rows.length).toBe(1);
  });
});
