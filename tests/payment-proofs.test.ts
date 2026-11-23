import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { appointments, payments, paymentProofs, services, serviceCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveProofAmount, imageMimeFromMagicBytes, phoneMatchesAppointment } from "@/lib/payment-proofs";
import { reviewMobileMoneyProof, submitMobileMoneyProof } from "@/lib/actions/payment-proofs";
import { signInAs, signOut, makeUser } from "./helpers";

let manager: Awaited<ReturnType<typeof makeUser>>;
let customer: Awaited<ReturnType<typeof makeUser>>;
let serviceId: string;

beforeAll(async () => {
  manager = await makeUser("manager", "Proof Reviewer");
  customer = await makeUser("customer", "Proof Customer");
  const [category] = await db.insert(serviceCategories).values({ name: `Proof test ${Date.now()}` }).returning();
  const [service] = await db.insert(services).values({ categoryId: category.id, name: "Proof Test Service", priceMin: 250, durationMinutes: 60 }).returning();
  serviceId = service.id;
});

afterEach(() => signOut());

async function makeAppointment(phone = "+233200123456") {
  const [appointment] = await db.insert(appointments).values({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: phone,
    serviceId,
    scheduledDate: "2027-11-30",
    scheduledTime: "11:00",
    durationMinutes: 60,
    priceEstimate: 250,
    source: "online",
    status: "pending",
    depositRequired: 100,
    depositPaid: 0,
    balanceDue: 250,
  }).returning();
  return appointment;
}

async function addUploadedProof(appointmentId: string, amount = 100, amountType: "deposit" | "full" = "deposit") {
  const [proof] = await db.insert(paymentProofs).values({
    appointmentId,
    amountType,
    amount,
    mimeType: "image/jpeg",
    data: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    status: "uploaded",
  }).returning();
  return proof;
}

describe("Payment proof validation", () => {
  it("derives deposit and full amount from the appointment balance rather than client input", () => {
    const appointment = { priceEstimate: 250, depositRequired: 100, depositPaid: 0, balanceDue: 250 };
    expect(deriveProofAmount(appointment, "deposit")).toBe(100);
    expect(deriveProofAmount(appointment, "full")).toBe(250);
    expect(deriveProofAmount({ ...appointment, depositPaid: 40, balanceDue: 210 }, "deposit")).toBe(60);
    expect(deriveProofAmount(appointment, "deposit")).not.toBe(999);
  });

  it("requires the full amount when no deposit is configured and rejects non-positive due amounts", () => {
    const appointment = { priceEstimate: 250, depositRequired: 0, depositPaid: 0, balanceDue: 250 };
    expect(deriveProofAmount(appointment, "deposit")).toBeNull();
    expect(deriveProofAmount(appointment, "full")).toBe(250);
    expect(deriveProofAmount({ ...appointment, balanceDue: 0 }, "full")).toBeNull();
  });

  it("validates image signatures and appointment phone matching", () => {
    expect(imageMimeFromMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(imageMimeFromMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(imageMimeFromMagicBytes(Buffer.from("RIFF0000WEBP"))).toBe("image/webp");
    expect(imageMimeFromMagicBytes(Buffer.from("not an image"))).toBeNull();
    expect(phoneMatchesAppointment("+233 20 012 3456", "0200123456")).toBe(true);
    expect(phoneMatchesAppointment("+233 20 012 3456", "0299999999")).toBe(false);
  });

  it("creates a pending payment from an uploaded proof using the server-derived amount, then confirms only after staff approval", async () => {
    const appointment = await makeAppointment();
    const proof = await addUploadedProof(appointment.id);

    const submitted = await submitMobileMoneyProof({ appointmentId: appointment.id, customerPhone: "0200123456", proofId: proof.id });
    expect(submitted.ok).toBe(true);
    const [storedProof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, proof.id));
    expect(storedProof.status).toBe("pending");
    const [payment] = await db.select().from(payments).where(eq(payments.id, storedProof.paymentId!));
    expect(payment.amount).toBe(100);
    expect(payment.status).toBe("pending");
    expect((await db.select().from(appointments).where(eq(appointments.id, appointment.id)))[0].status).toBe("pending");

    await signInAs(manager);
    const reviewed = await reviewMobileMoneyProof({ proofId: proof.id, decision: "approve" });
    expect(reviewed.ok).toBe(true);
    const [approvedAppointment] = await db.select().from(appointments).where(eq(appointments.id, appointment.id));
    expect(approvedAppointment.status).toBe("confirmed");
    expect(approvedAppointment.depositPaid).toBe(100);
    const [approvedProof] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, proof.id));
    expect(approvedProof.status).toBe("approved");
  });

  it("rejects wrong phones and client-inflated amounts; rejecting leaves the appointment pending for retry", async () => {
    const wrongPhoneAppointment = await makeAppointment("+233201111111");
    const wrongPhoneProof = await addUploadedProof(wrongPhoneAppointment.id);
    const wrongPhone = await submitMobileMoneyProof({ appointmentId: wrongPhoneAppointment.id, customerPhone: "0209999999", proofId: wrongPhoneProof.id });
    expect(wrongPhone.ok).toBe(false);

    const inflatedAppointment = await makeAppointment("+233202222222");
    const inflatedProof = await addUploadedProof(inflatedAppointment.id, 999);
    const inflated = await submitMobileMoneyProof({ appointmentId: inflatedAppointment.id, customerPhone: "0202222222", proofId: inflatedProof.id });
    expect(inflated.ok).toBe(false);

    const rejectedAppointment = await makeAppointment("+233203333333");
    const rejectedProof = await addUploadedProof(rejectedAppointment.id);
    const submitted = await submitMobileMoneyProof({ appointmentId: rejectedAppointment.id, customerPhone: "0203333333", proofId: rejectedProof.id });
    expect(submitted.ok).toBe(true);
    await signInAs(manager);
    const rejected = await reviewMobileMoneyProof({ proofId: rejectedProof.id, decision: "reject", note: "Screenshot does not show a successful transfer." });
    expect(rejected.ok).toBe(true);
    const [stillPending] = await db.select().from(appointments).where(eq(appointments.id, rejectedAppointment.id));
    expect(stillPending.status).toBe("pending");
    const [saved] = await db.select().from(paymentProofs).where(eq(paymentProofs.id, rejectedProof.id));
    expect(saved.status).toBe("rejected");
  });
});
