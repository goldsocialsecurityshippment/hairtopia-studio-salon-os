import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/db";
import { appointments, services, serviceCategories, payments, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordPayment, confirmMomoCallback, refundPayment } from "@/lib/actions/payments";
import { signInAs, signOut, makeUser } from "./helpers";

let manager: Awaited<ReturnType<typeof makeUser>>;
let stylist: Awaited<ReturnType<typeof makeUser>>;
let otherStylist: Awaited<ReturnType<typeof makeUser>>;
let customer: Awaited<ReturnType<typeof makeUser>>;
let serviceId: string;

beforeAll(async () => {
  manager = await makeUser("manager", "Pay Manager");
  stylist = await makeUser("stylist", "Pay Stylist");
  otherStylist = await makeUser("stylist", "Other Pay Stylist");
  customer = await makeUser("customer", "Pay Customer");
  const [cat] = await db.insert(serviceCategories).values({ name: "PayCat " + Math.random() }).returning();
  const [svc] = await db.insert(services).values({ categoryId: cat.id, name: "Pay Svc", priceMin: 250, durationMinutes: 60 }).returning();
  serviceId = svc.id;
});
afterEach(() => signOut());

async function newAppt(price = 250, depositRequired = 100) {
  const [a] = await db.insert(appointments).values({
    customerId: customer.id, customerName: customer.name, customerPhone: "+233200000001",
    serviceId, stylistId: stylist.id, scheduledDate: "2027-05-01", scheduledTime: "10:00",
    durationMinutes: 60, priceEstimate: price, status: "pending",
    depositRequired, depositPaid: 0, balanceDue: price,
  }).returning();
  return a.id;
}
const get = async (id: string) => (await db.select().from(appointments).where(eq(appointments.id, id)))[0];

describe("Manual payments and deposit → confirmation gating", () => {
  it("a paid GH₵100 cash deposit confirms the booking and leaves the balance owing", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const r = await recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" });
    expect(r.ok).toBe(true);
    const a = await get(id);
    expect(a.status).toBe("confirmed");
    expect(a.depositPaid).toBe(100);
    expect(a.balanceDue).toBe(150);
    expect(a.paymentStatus).toBe("partial");
  });

  it("a deposit SMALLER than the required amount does NOT confirm the booking", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    await recordPayment({ appointmentId: id, amount: 40, method: "cash", paymentType: "deposit" });
    expect((await get(id)).status).toBe("pending");
  });

  it("paying the FULL amount up front also satisfies the deposit and confirms the booking", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    await recordPayment({ appointmentId: id, amount: 250, method: "cash", paymentType: "full" });
    const a = await get(id);
    expect(a.status).toBe("confirmed");
    expect(a.balanceDue).toBe(0);
    expect(a.paymentStatus).toBe("paid");
  });

  it("successive partial payments ACCUMULATE: 100 deposit + 50 + 50 leaves 50 owing; a final 50 settles it", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    await recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" });
    await recordPayment({ appointmentId: id, amount: 50, method: "cash", paymentType: "final" });
    expect((await get(id)).balanceDue).toBe(100);
    await recordPayment({ appointmentId: id, amount: 50, method: "cash", paymentType: "final" });
    expect((await get(id)).balanceDue).toBe(50);
    await recordPayment({ appointmentId: id, amount: 50, method: "cash", paymentType: "final" });
    const a = await get(id);
    expect(a.balanceDue).toBe(0);
    expect(a.paymentStatus).toBe("paid");
  });

  it("refuses a payment larger than the outstanding balance (no overpayment)", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const r = await recordPayment({ appointmentId: id, amount: 999, method: "cash", paymentType: "full" });
    expect(r.ok).toBe(false);
    expect((await get(id)).depositPaid).toBe(0);
  });
});

describe("Mobile money: no payment, no confirmation", () => {
  it("MoMo NOT configured: the attempt fails, no payment row is created, booking stays pending", async () => {
    delete process.env.MTN_MOMO_API_USER; delete process.env.MTN_MOMO_API_KEY; delete process.env.MTN_MOMO_SUBSCRIPTION_KEY;
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const r = await recordPayment({ appointmentId: id, amount: 100, method: "mobile_money", paymentType: "deposit" });
    expect(r.ok).toBe(false);
    expect((await db.select().from(payments).where(eq(payments.appointmentId, id))).length).toBe(0);
    expect((await get(id)).status).toBe("pending");
  });

  describe("with (stub) credentials configured", () => {
    beforeAll(() => {
      process.env.MTN_MOMO_API_USER = "t"; process.env.MTN_MOMO_API_KEY = "t"; process.env.MTN_MOMO_SUBSCRIPTION_KEY = "t";
    });

    it("a MoMo request is recorded as PENDING and does NOT confirm the booking or reduce the balance", async () => {
      const id = await newAppt();
      await signInAs({ id: manager.id, role: "manager", name: "m" });
      const r = await recordPayment({ appointmentId: id, amount: 100, method: "mobile_money", paymentType: "deposit" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.status).toBe("pending");
      const a = await get(id);
      expect(a.status).toBe("pending");
      expect(a.depositPaid).toBe(0);
      expect(a.balanceDue).toBe(250);
    });

    it("only a provider callback marks it successful; the browser/UI cannot", async () => {
      const id = await newAppt();
      await signInAs({ id: manager.id, role: "manager", name: "m" });
      const r = await recordPayment({ appointmentId: id, amount: 100, method: "mobile_money", paymentType: "deposit" });
      if (!r.ok) throw new Error("setup");
      signOut();
      const cb = await confirmMomoCallback({ referenceId: r.transactionReference, status: "SUCCESSFUL", financialTransactionId: "F1" });
      expect(cb.ok).toBe(true);
      const a = await get(id);
      expect(a.status).toBe("confirmed");
      expect(a.depositPaid).toBe(100);
    });

    it("a FAILED callback leaves the booking pending and unpaid", async () => {
      const id = await newAppt();
      await signInAs({ id: manager.id, role: "manager", name: "m" });
      const r = await recordPayment({ appointmentId: id, amount: 100, method: "mobile_money", paymentType: "deposit" });
      if (!r.ok) throw new Error("setup");
      signOut();
      await confirmMomoCallback({ referenceId: r.transactionReference, status: "FAILED" });
      const a = await get(id);
      expect(a.status).toBe("pending");
      expect(a.depositPaid).toBe(0);
      const [p] = await db.select().from(payments).where(eq(payments.transactionReference, r.transactionReference));
      expect(p.status).toBe("failed");
    });

    it("8 SIMULTANEOUS identical SUCCESSFUL callbacks apply the deposit exactly once", async () => {
      const id = await newAppt();
      await signInAs({ id: manager.id, role: "manager", name: "m" });
      const r = await recordPayment({ appointmentId: id, amount: 100, method: "mobile_money", paymentType: "deposit" });
      if (!r.ok) throw new Error("setup");
      signOut();
      const payload = { referenceId: r.transactionReference, status: "SUCCESSFUL", financialTransactionId: "F2" };
      const results = await Promise.all(Array.from({ length: 8 }, () => confirmMomoCallback(payload)));
      expect(results.every((x) => x.ok)).toBe(true);
      expect(results.filter((x) => x.ok && !x.duplicate).length).toBe(1);
      const a = await get(id);
      expect(a.depositPaid).toBe(100);
      expect(a.balanceDue).toBe(150);
    });

    it("an unknown transaction reference is rejected and changes nothing", async () => {
      const r = await confirmMomoCallback({ referenceId: "does-not-exist", status: "SUCCESSFUL" });
      expect(r.ok).toBe(false);
    });
  });
});

describe("Payment authorization, refunds and audit", () => {
  it("a stylist cannot record payment against ANOTHER stylist's appointment", async () => {
    const id = await newAppt();
    await signInAs({ id: otherStylist.id, role: "stylist", name: "o" });
    const r = await recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" });
    expect(r.ok).toBe(false);
  });

  it("customers and anonymous callers cannot record payments", async () => {
    const id = await newAppt();
    await signInAs({ id: customer.id, role: "customer", name: "c" });
    await expect(recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" })).rejects.toThrow("FORBIDDEN");
    signOut();
    await expect(recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" })).rejects.toThrow();
  });

  it("every recorded payment writes an audit entry with who/what/amount", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const r = await recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" });
    if (!r.ok) throw new Error("setup");
    const [p] = await db.select().from(payments).where(eq(payments.appointmentId, id));
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, p.id));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].userId).toBe(manager.id);
    expect(p.transactionReference).toBeTruthy();
  });

  it("a refund restores the balance owing; stylists cannot refund; refund cannot exceed the payment", async () => {
    const id = await newAppt();
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    await recordPayment({ appointmentId: id, amount: 100, method: "cash", paymentType: "deposit" });
    const [p] = await db.select().from(payments).where(eq(payments.appointmentId, id));

    await signInAs({ id: stylist.id, role: "stylist", name: "s" });
    await expect(refundPayment({ paymentId: p.id, amount: 100, reason: "x" })).rejects.toThrow("FORBIDDEN");

    await signInAs({ id: manager.id, role: "manager", name: "m" });
    expect((await refundPayment({ paymentId: p.id, amount: 500, reason: "too much" })).ok).toBe(false);
    expect((await refundPayment({ paymentId: p.id, amount: 100, reason: "customer request" })).ok).toBe(true);

    const a = await get(id);
    expect(a.depositPaid).toBe(0);
    expect(a.balanceDue).toBe(250);
  });
});

describe("Customer self-service deposit (booking wizard payment step)", () => {
  it("without MoMo configured, the attempt honestly fails — never fakes a prompt", async () => {
    delete process.env.MTN_MOMO_API_USER; delete process.env.MTN_MOMO_API_KEY; delete process.env.MTN_MOMO_SUBSCRIPTION_KEY;
    const { initiateCustomerDeposit } = await import("@/lib/actions/payments");
    const id = await newAppt();
    const r = await initiateCustomerDeposit({ appointmentId: id, customerPhone: "0200000001", momoNumber: "0200000001" });
    expect(r.ok).toBe(false);
  });

  it("rejects a caller whose phone does not match the booking and who isn't its owner", async () => {
    process.env.MTN_MOMO_API_USER = "t"; process.env.MTN_MOMO_API_KEY = "t"; process.env.MTN_MOMO_SUBSCRIPTION_KEY = "t";
    const { initiateCustomerDeposit } = await import("@/lib/actions/payments");
    const id = await newAppt();
    const r = await initiateCustomerDeposit({ appointmentId: id, customerPhone: "0299999999", momoNumber: "0299999999" });
    expect(r.ok).toBe(false);
  });

  it("with the matching phone, a MoMo request is accepted as PENDING and does not confirm the booking by itself", async () => {
    const { initiateCustomerDeposit } = await import("@/lib/actions/payments");
    const id = await newAppt();
    const r = await initiateCustomerDeposit({ appointmentId: id, customerPhone: "+233200000001", momoNumber: "0200000001" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("pending");
    expect((await get(id)).status).toBe("pending");
  });
});
