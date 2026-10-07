import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { users, services, serviceCategories, staffProfiles, stylistServices, availability, notifications, appointments, reviews, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAppointment } from "@/lib/actions/booking";
import { getActiveServiceTerms } from "@/lib/actions/service-terms";
import { confirmMomoCallback, initiateCustomerDeposit } from "@/lib/actions/payments";
import { requestReschedule, resolveRescheduleRequest } from "@/lib/actions/reschedule";
import { getActiveStylists, getPublicReviewsForStylist } from "@/lib/data/queries";
import { makeUser } from "./helpers";

/**
 * This test walks the exact "Bridal Makeup customer journey" scenario from
 * the spec end-to-end, through the REAL application code (no mocked
 * business logic — only the Next.js framework boundary is mocked, same as
 * every other test file). Every assertion below corresponds to one
 * numbered step in that scenario.
 */
describe("Full business flow: Bridal Makeup journey, reschedule, review → rating", () => {
  let artist: Awaited<ReturnType<typeof makeUser>>;
  let hairStylist: Awaited<ReturnType<typeof makeUser>>;
  let bridal: typeof services.$inferSelect;
  let appointmentId: string;
  let customerId: string | null;
  let bridalCustomer: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    const { salonSettings } = await import("@/db/schema");
    await db.insert(salonSettings).values({ id: "main" }).onConflictDoNothing();

    artist = await makeUser("stylist", "Flow Test Artist");
    hairStylist = await makeUser("stylist", "Flow Test Hair Stylist");
    await db.insert(staffProfiles).values({ userId: artist.id, category: "makeup_artist" });
    await db.insert(availability).values({ stylistId: artist.id, dayOfWeek: 6, startTime: "09:00", endTime: "18:00" }); // Saturday

    const [cat] = await db.insert(serviceCategories).values({ name: "FlowMakeup " + Math.random() }).returning();
    [bridal] = await db.insert(services).values({ categoryId: cat.id, name: "Bridal Makeup", priceMin: 1500, durationMinutes: 150, bufferMinutes: 15, description: "1 look" }).returning();
    await db.insert(stylistServices).values({ stylistId: artist.id, serviceId: bridal.id });
  });

  it("STEP 4-6: shows price, '1 look', terms, and only the Makeup Artist as eligible (not a hair stylist)", async () => {
    expect(bridal.priceMin).toBe(1500);
    expect(bridal.description).toContain("1 look");
    const stylists = await getActiveStylists();
    const eligible = stylists.filter((s) => s.serviceIds.includes(bridal.id));
    expect(eligible.map((s) => s.id)).toContain(artist.id);
    expect(eligible.map((s) => s.id)).not.toContain(hairStylist.id);
  });

  it("STEP 5-9: accepting terms + booking creates a pending appointment with the GH₵100 deposit and correct price", async () => {
    // Publish terms for this test's own Bridal service (each test creates its own to stay isolated).
    const { publishServiceTerms } = await import("@/lib/actions/service-terms");
    const owner = await makeUser("owner", "Flow Owner");
    const { signInAs, signOut } = await import("./helpers");
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    await publishServiceTerms({ serviceId: bridal.id, title: "Bridal T&C", content: "Non-refundable deposit required." });
    signOut();

    const terms = await getActiveServiceTerms(bridal.id);
    expect(terms).not.toBeNull();

    // The customer is logged in for this booking — this is what lets the
    // resulting appointment carry a real customerId to notify later.
    bridalCustomer = await makeUser("customer", "Akosua Bride");
    await signInAs({ id: bridalCustomer.id, role: "customer", name: bridalCustomer.name });

    const booking = await createAppointment({
      serviceId: bridal.id,
      stylistId: artist.id,
      date: "2027-06-12", // a Saturday
      time: "10:00",
      customerName: "Akosua Bride",
      customerPhone: "0201234567",
      acceptedTermsId: terms!.id,
    });
    expect(booking.ok).toBe(true);
    if (!booking.ok) return;
    appointmentId = booking.appointmentId;
    expect(booking.depositRequired).toBe(100);

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
    expect(appt.status).toBe("pending");
    expect(appt.priceEstimate).toBe(1500);
    expect(appt.acceptedTermsVersion).toBe(1);
    customerId = appt.customerId;
    signOut();
  });

  it("STEP 10-11: payment — MoMo not configured fails honestly; once 'live' (stubbed), a verified callback confirms the booking and updates balance", async () => {
    delete process.env.MTN_MOMO_API_USER;
    const unconfigured = await initiateCustomerDeposit({ appointmentId, customerPhone: "0201234567", momoNumber: "0201234567" });
    expect(unconfigured.ok).toBe(false);

    process.env.MTN_MOMO_API_USER = "t"; process.env.MTN_MOMO_API_KEY = "t"; process.env.MTN_MOMO_SUBSCRIPTION_KEY = "t";
    const attempt = await initiateCustomerDeposit({ appointmentId, customerPhone: "0201234567", momoNumber: "0201234567" });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.status).toBe("pending"); // never immediately "successful" from our own code

    const cb = await confirmMomoCallback({ referenceId: attempt.transactionReference, status: "SUCCESSFUL", financialTransactionId: "SIM1" });
    expect(cb.ok).toBe(true);

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
    expect(appt.status).toBe("confirmed");
    expect(appt.depositPaid).toBe(100);
    expect(appt.balanceDue).toBe(1400);
  });

  it("STEP 12-13: both the customer and the assigned Makeup Artist receive real notifications", async () => {
    expect(customerId).toBeTruthy();
    const customerNotifs = await db.select().from(notifications).where(eq(notifications.userId, customerId!));
    expect(customerNotifs.some((n) => n.type === "payment_received")).toBe(true); // "Booking confirmed"

    const artistNotifs = await db.select().from(notifications).where(eq(notifications.userId, artist.id));
    expect(artistNotifs.some((n) => n.type === "new_appointment")).toBe(true);
  });

  it("STEP 21-27: customer requests a reschedule outside the 24h window; staff approval moves the date/time WITHOUT touching payment, and it's audited", async () => {
    const reschedReq = await requestReschedule({ appointmentId, requestedDate: "2027-06-19", requestedTime: "11:00" });
    expect(reschedReq.ok).toBe(true);
    if (!reschedReq.ok) return;

    const { signInAs } = await import("./helpers");
    const manager = await makeUser("manager", "Flow Manager");
    await signInAs({ id: manager.id, role: "manager", name: "m" });
    const approval = await resolveRescheduleRequest({ requestId: reschedReq.requestId, decision: "approved" });
    expect(approval.ok).toBe(true);

    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
    expect(appt.scheduledDate).toBe("2027-06-19");
    expect(appt.scheduledTime).toBe("11:00");
    // Payment/deposit relationship must be completely unaffected by a reschedule.
    expect(appt.depositPaid).toBe(100);
    expect(appt.balanceDue).toBe(1400);

    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.action, "reschedule_approved"));
    expect(auditRows.some((r) => r.entityId === appointmentId)).toBe(true);
  });

  it("STEP 28-31: on completion, an approved review updates the Makeup Artist's REAL rating — an unmoderated one does not", async () => {
    await db.update(appointments).set({ status: "completed" }).where(eq(appointments.id, appointmentId));

    const [review] = await db
      .insert(reviews)
      .values({
        appointmentId,
        overallRating: 5,
        qualityRating: 5,
        professionalismRating: 5,
        communicationRating: 5,
        respectfulnessRating: 5,
        punctualityRating: 5,
        comment: "Absolutely stunning bridal look!",
        moderated: false,
        hidden: false,
      })
      .returning();

    const before = await getActiveStylists();
    expect(before.find((s) => s.id === artist.id)?.avgRating).toBeNull();

    await db.update(reviews).set({ moderated: true }).where(eq(reviews.id, review.id));

    const after = await getActiveStylists();
    const artistAfter = after.find((s) => s.id === artist.id);
    expect(artistAfter?.avgRating).toBe(5);
    expect(artistAfter?.reviewCount).toBe(1);

    const publicReviews = await getPublicReviewsForStylist(artist.id);
    expect(publicReviews.some((r) => r.review.comment === "Absolutely stunning bridal look!")).toBe(true);
  });
});
