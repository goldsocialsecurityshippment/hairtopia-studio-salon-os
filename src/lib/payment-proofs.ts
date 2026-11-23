export type ProofAmountType = "deposit" | "full";

export interface AppointmentForProofAmount {
  priceEstimate: number;
  depositRequired: number;
  depositPaid: number;
  balanceDue: number;
}

/** The browser selects only the payment kind. Never accept a client amount. */
export function deriveProofAmount(appointment: AppointmentForProofAmount, amountType: ProofAmountType): number | null {
  if (amountType === "deposit") {
    if (appointment.depositRequired <= 0) return null;
    const due = Math.max(0, appointment.depositRequired - appointment.depositPaid);
    return due > 0 ? due : null;
  }

  const due = Math.max(0, Math.min(appointment.balanceDue, appointment.priceEstimate - appointment.depositPaid));
  return due > 0 ? due : null;
}

export function imageMimeFromMagicBytes(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

export function phoneMatchesAppointment(appointmentPhone: string, suppliedPhone: string): boolean {
  const stored = appointmentPhone.replace(/\D/g, "");
  const supplied = suppliedPhone.replace(/\D/g, "");
  return supplied.length >= 9 && stored.slice(-9) === supplied.slice(-9);
}
