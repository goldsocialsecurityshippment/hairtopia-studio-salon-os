import { describe, expect, it } from "vitest";
import {
  markPendingProofBookingSubmitted,
  parsePendingProofBookings,
  upsertPendingProofBooking,
  type PendingProofBooking,
} from "@/lib/pending-proof-bookings";

const booking = (appointmentId: string): PendingProofBooking => ({
  appointmentId,
  serviceName: "Knotless Braids",
  stylistName: "Ama Owusu",
  date: "2026-12-10",
  time: "09:00",
  phone: "0501234567",
  depositAmount: 100,
  requiredAmount: 100,
  fullAmount: 280,
  status: "awaiting-proof",
});

describe("pending proof bookings", () => {
  it("returns an empty queue for missing, malformed, or non-array storage", () => {
    expect(parsePendingProofBookings(null)).toEqual([]);
    expect(parsePendingProofBookings("not json")).toEqual([]);
    expect(parsePendingProofBookings(JSON.stringify({ appointmentId: "a" }))).toEqual([]);
  });

  it("keeps multiple distinct appointments and discards invalid or duplicate entries", () => {
    const first = booking("appt-1");
    const second = booking("appt-2");
    const result = parsePendingProofBookings(JSON.stringify([first, second, first, { ...booking("bad"), requiredAmount: -1 }]));

    expect(result.map((item) => item.appointmentId)).toEqual(["appt-1", "appt-2"]);
  });

  it("upserts an appointment without duplicating it in the queue", () => {
    const original = booking("appt-1");
    const updated = { ...original, time: "10:00" };

    expect(upsertPendingProofBooking([original, booking("appt-2")], updated)).toEqual([booking("appt-2"), updated]);
  });

  it("marks only the selected appointment's proof as submitted and clears its phone from session storage", () => {
    const updated = markPendingProofBookingSubmitted([booking("appt-1"), booking("appt-2")], "appt-1");

    expect(updated[0]).toMatchObject({ appointmentId: "appt-1", status: "submitted", phone: "" });
    expect(updated[1]).toMatchObject({ appointmentId: "appt-2", status: "awaiting-proof", phone: "0501234567" });
  });
});
