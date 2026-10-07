import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/db";
import {
  services, serviceCategories, serviceTerms, stylistServices, availability,
  salonSettings, appointments, staffProfiles, notifications,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAppointment, getAvailableSlots, setAppointmentFinalPrice } from "@/lib/actions/booking";
import { publishServiceTerms } from "@/lib/actions/service-terms";
import { getActiveStylists } from "@/lib/data/queries";
import { signInAs, signOut, makeUser } from "./helpers";

// A far-future Monday so the "is today" past-slot filter never interferes.
const MONDAY = "2027-03-08";

let makeupArtist: Awaited<ReturnType<typeof makeUser>>;
let hairStylist: Awaited<ReturnType<typeof makeUser>>;
let owner: Awaited<ReturnType<typeof makeUser>>;
let bridal: typeof services.$inferSelect;
let softGlam: typeof services.$inferSelect;
let hairSvc: typeof services.$inferSelect;
let bridalTermsV1: typeof serviceTerms.$inferSelect;

beforeAll(async () => {
  await db.insert(salonSettings).values({ id: "main" }).onConflictDoNothing();
  await db.update(salonSettings).set({ overbookingAllowed: false, overtimeAllowedMinutes: 0 }).where(eq(salonSettings.id, "main"));

  makeupArtist = await makeUser("stylist", "Test Makeup Artist");
  hairStylist = await makeUser("stylist", "Test Hair Stylist");
  owner = await makeUser("owner");

  await db.insert(staffProfiles).values({ userId: makeupArtist.id, category: "makeup_artist" });
  await db.insert(staffProfiles).values({ userId: hairStylist.id, category: "hair_stylist" });

  for (const s of [makeupArtist, hairStylist]) {
    await db.insert(availability).values({ stylistId: s.id, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });
  }

  const [makeupCat] = await db.insert(serviceCategories).values({ name: "TestMakeup " + Math.random() }).returning();
  const [hairCat] = await db.insert(serviceCategories).values({ name: "TestHair " + Math.random() }).returning();

  [softGlam] = await db.insert(services).values({ categoryId: makeupCat.id, name: "Soft Glam", priceMin: 200, priceMax: 300, durationMinutes: 75, bufferMinutes: 15 }).returning();
  [bridal] = await db.insert(services).values({ categoryId: makeupCat.id, name: "Bridal Makeup", priceMin: 1500, durationMinutes: 150, bufferMinutes: 15 }).returning();
  [hairSvc] = await db.insert(services).values({ categoryId: hairCat.id, name: "Test Wash", priceMin: 100, durationMinutes: 60, bufferMinutes: 15 }).returning();

  [bridalTermsV1] = await db.insert(serviceTerms).values({ serviceId: bridal.id, version: 1, title: "Bridal T&C", content: "v1 terms", active: true }).returning();

  // Only the makeup artist is assigned to the makeup services; only the hair stylist to hair.
  await db.insert(stylistServices).values([
    { stylistId: makeupArtist.id, serviceId: bridal.id },
    { stylistId: makeupArtist.id, serviceId: softGlam.id },
    { stylistId: hairStylist.id, serviceId: hairSvc.id },
  ]);
});

afterEach(() => signOut());

const baseBooking = (over: Partial<Parameters<typeof createAppointment>[0]> = {}) => ({
  serviceId: softGlam.id,
  stylistId: makeupArtist.id,
  date: MONDAY,
  time: "09:00",
  customerName: "Booking Tester",
  customerPhone: "0209991111",
  ...over,
});

describe("Service eligibility (professional ↔ service assignment)", () => {
  it("the assigned Makeup Artist is listed as eligible for Bridal Makeup; the hair stylist is NOT", async () => {
    const stylists = await getActiveStylists();
    const artist = stylists.find((s) => s.id === makeupArtist.id)!;
    const hair = stylists.find((s) => s.id === hairStylist.id)!;
    expect(artist.serviceIds).toContain(bridal.id);
    expect(hair.serviceIds).not.toContain(bridal.id);
    expect(artist.profile?.category).toBe("makeup_artist");
  });

  it("SERVER-SIDE: booking Bridal Makeup with an ineligible hair stylist is rejected (cannot be bypassed via a crafted request)", async () => {
    const result = await createAppointment(
      baseBooking({ serviceId: bridal.id, stylistId: hairStylist.id, acceptedTermsId: bridalTermsV1.id, customerPhone: "0209991112" })
    );
    expect(result.ok).toBe(false);
  });
});

describe("Availability, duplicate-booking prevention, and deposit", () => {
  it("offers open slots within the professional's working hours", async () => {
    const slots = await getAvailableSlots({ stylistId: makeupArtist.id, serviceId: softGlam.id, date: MONDAY });
    expect(slots).toContain("09:00");
    expect(slots).not.toContain("08:30"); // before their shift start
  });

  it("creates a booking with the GH₵100 deposit required and the balance tracked", async () => {
    const result = await createAppointment(baseBooking({ time: "09:00", customerPhone: "0209991113" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, result.appointmentId));
    expect(appt.depositRequired).toBe(100);
    expect(appt.depositPaid).toBe(0);
    expect(appt.balanceDue).toBe(200); // Soft Glam base 200
    expect(appt.status).toBe("pending"); // NOT confirmed until the deposit is actually paid
  });

  it("the just-booked slot is no longer offered, and a second booking on it is rejected server-side", async () => {
    const slots = await getAvailableSlots({ stylistId: makeupArtist.id, serviceId: softGlam.id, date: MONDAY });
    expect(slots).not.toContain("09:00");

    const dup = await createAppointment(baseBooking({ time: "09:00", customerPhone: "0209991114" }));
    expect(dup.ok).toBe(false);
  });

});

describe("Overbooking and overtime genuinely change availability", () => {
  it("BUFFER: after a 60-min service at 09:00 (ends 10:00, buffer to 10:15), 10:00 is blocked but 10:30 is open", async () => {
    // A 60-minute service + 15-minute buffer is distinguishable from "no buffer"
    // at 30-minute slot granularity (10:00 would be free without a buffer).
    const OTHER_MONDAY = "2027-03-22";
    const booked = await createAppointment({
      serviceId: hairSvc.id, stylistId: hairStylist.id, date: OTHER_MONDAY, time: "09:00",
      customerName: "Buffer Tester", customerPhone: "0209991119",
    });
    expect(booked.ok).toBe(true);

    const slots = await getAvailableSlots({ stylistId: hairStylist.id, serviceId: hairSvc.id, date: OTHER_MONDAY });
    expect(slots).not.toContain("09:30"); // inside the service itself
    expect(slots).not.toContain("10:00"); // service ended, but the buffer still blocks it
    expect(slots).toContain("10:30");     // first slot clear of the buffer
  });

  it("OVERBOOKING ON removes the buffer requirement: 10:00 (back-to-back) opens up, but 09:30 (inside the service) never does", async () => {
    const OTHER_MONDAY = "2027-03-22";
    await db.update(salonSettings).set({ overbookingAllowed: true }).where(eq(salonSettings.id, "main"));
    const slots = await getAvailableSlots({ stylistId: hairStylist.id, serviceId: hairSvc.id, date: OTHER_MONDAY });
    await db.update(salonSettings).set({ overbookingAllowed: false }).where(eq(salonSettings.id, "main"));

    expect(slots).toContain("10:00");     // this is the slot overbooking is supposed to unlock
    expect(slots).not.toContain("09:30"); // still never a true double-booking
    expect(slots).not.toContain("09:00");
  });

  it("with overtime ON, a late slot that would end after closing becomes available; OFF it does not", async () => {
    const off = await getAvailableSlots({ stylistId: hairStylist.id, serviceId: hairSvc.id, date: MONDAY });
    expect(off).not.toContain("16:30"); // 16:30 + 60min = 17:30 > 17:00 close

    await db.update(salonSettings).set({ overtimeAllowedMinutes: 60 }).where(eq(salonSettings.id, "main"));
    const on = await getAvailableSlots({ stylistId: hairStylist.id, serviceId: hairSvc.id, date: MONDAY });
    expect(on).toContain("16:30");
    await db.update(salonSettings).set({ overtimeAllowedMinutes: 0 }).where(eq(salonSettings.id, "main"));
  });
});

describe("Bridal Makeup Terms & Conditions enforcement", () => {
  it("rejects a Bridal booking submitted with NO terms acceptance", async () => {
    const r = await createAppointment(baseBooking({ serviceId: bridal.id, time: "13:00", customerPhone: "0209991115" }));
    expect(r.ok).toBe(false);
  });

  it("rejects a Bridal booking submitted with a WRONG terms id", async () => {
    const r = await createAppointment(baseBooking({ serviceId: bridal.id, time: "13:00", acceptedTermsId: "not-a-real-id", customerPhone: "0209991116" }));
    expect(r.ok).toBe(false);
  });

  it("accepts a Bridal booking with the current terms, and stores the accepted version on the appointment", async () => {
    const r = await createAppointment(baseBooking({ serviceId: bridal.id, time: "13:00", acceptedTermsId: bridalTermsV1.id, customerPhone: "0209991117" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, r.appointmentId));
    expect(appt.acceptedTermsId).toBe(bridalTermsV1.id);
    expect(appt.acceptedTermsVersion).toBe(1);
    expect(appt.acceptedTermsAt).toBeTruthy();
    expect(appt.priceEstimate).toBe(1500);
    expect(appt.depositRequired).toBe(100);
    expect(appt.balanceDue).toBe(1500);
  });

  it("after the owner publishes v2, the OLD v1 id is rejected, and the stored v1 booking keeps its v1 record", async () => {
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    const pub = await publishServiceTerms({ serviceId: bridal.id, title: "Bridal T&C", content: "v2 terms" });
    expect(pub.ok).toBe(true);
    signOut();

    const stale = await createAppointment(baseBooking({ serviceId: bridal.id, date: "2027-03-15", time: "09:00", acceptedTermsId: bridalTermsV1.id, customerPhone: "0209991118" }));
    expect(stale.ok).toBe(false);

    const [v1Booking] = await db.select().from(appointments).where(eq(appointments.customerPhone, "0209991117"));
    expect(v1Booking.acceptedTermsVersion).toBe(1);
  });

  it("only owner/admin can publish terms — a stylist cannot", async () => {
    await signInAs({ id: makeupArtist.id, role: "stylist", name: "s" });
    await expect(publishServiceTerms({ serviceId: bridal.id, title: "x", content: "hacked terms" })).rejects.toThrow("FORBIDDEN");
  });
});

describe("Makeup price ranges: final price validated server-side", () => {
  let apptId: string;
  beforeAll(async () => {
    const [a] = await db.select().from(appointments).where(eq(appointments.customerPhone, "0209991113"));
    apptId = a.id;
  });

  it("accepts a final price inside Soft Glam's GH₵200–300 range", async () => {
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    const r = await setAppointmentFinalPrice(apptId, 260);
    expect(r.ok).toBe(true);
    const [a] = await db.select().from(appointments).where(eq(appointments.id, apptId));
    expect(a.priceEstimate).toBe(260);
    expect(a.balanceDue).toBe(260);
  });

  it("rejects a price below the range", async () => {
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    expect((await setAppointmentFinalPrice(apptId, 150)).ok).toBe(false);
  });

  it("rejects a price above the range", async () => {
    await signInAs({ id: owner.id, role: "owner", name: "o" });
    expect((await setAppointmentFinalPrice(apptId, 350)).ok).toBe(false);
  });

  it("a stylist who is NOT the assigned professional cannot change the price", async () => {
    await signInAs({ id: hairStylist.id, role: "stylist", name: "h" });
    expect((await setAppointmentFinalPrice(apptId, 250)).ok).toBe(false);
  });

  it("a customer (or anonymous caller) cannot change prices at all", async () => {
    signOut();
    await expect(setAppointmentFinalPrice(apptId, 250)).rejects.toThrow();
  });
});

describe("Notifications targeting", () => {
  it("the assigned professional receives a notification when a booking is created for them", async () => {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, makeupArtist.id));
    expect(rows.length).toBeGreaterThan(0);
  });
});
