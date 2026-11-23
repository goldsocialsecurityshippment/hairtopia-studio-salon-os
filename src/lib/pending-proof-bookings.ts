export type PendingProofBookingStatus = "awaiting-proof" | "submitted";

export type PendingProofBooking = {
  appointmentId: string;
  serviceName: string;
  stylistName: string;
  date: string;
  time: string;
  phone: string;
  depositAmount: number;
  requiredAmount: number;
  fullAmount: number;
  status: PendingProofBookingStatus;
};

export const PENDING_PROOF_BOOKINGS_STORAGE_KEY = "hairtopia.pending-proof-bookings.v1";

function isPendingProofBooking(value: unknown): value is PendingProofBooking {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.appointmentId === "string" && item.appointmentId.length > 0 &&
    typeof item.serviceName === "string" &&
    typeof item.stylistName === "string" &&
    typeof item.date === "string" &&
    typeof item.time === "string" &&
    typeof item.phone === "string" &&
    typeof item.depositAmount === "number" && Number.isFinite(item.depositAmount) && item.depositAmount >= 0 &&
    typeof item.requiredAmount === "number" && Number.isFinite(item.requiredAmount) && item.requiredAmount >= 0 &&
    typeof item.fullAmount === "number" && Number.isFinite(item.fullAmount) && item.fullAmount >= 0 &&
    (item.status === "awaiting-proof" || item.status === "submitted")
  );
}

export function parsePendingProofBookings(serialized: string | null): PendingProofBooking[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, PendingProofBooking>();
    for (const item of parsed) {
      if (isPendingProofBooking(item)) unique.set(item.appointmentId, item);
    }
    return Array.from(unique.values());
  } catch {
    return [];
  }
}

export function upsertPendingProofBooking(
  bookings: PendingProofBooking[],
  booking: PendingProofBooking,
): PendingProofBooking[] {
  return [...bookings.filter((item) => item.appointmentId !== booking.appointmentId), booking];
}

export function markPendingProofBookingSubmitted(
  bookings: PendingProofBooking[],
  appointmentId: string,
): PendingProofBooking[] {
  return bookings.map((item) =>
    item.appointmentId === appointmentId ? { ...item, status: "submitted", phone: "" } : item,
  );
}
