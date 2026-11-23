import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, payments, paymentProofs } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { deriveProofAmount, imageMimeFromMagicBytes, phoneMatchesAppointment, type ProofAmountType } from "@/lib/payment-proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const ipKey = clientKeyFromHeaders(request.headers, "payment-proof-upload");
  if (!checkRateLimit(ipKey, 12, 10 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_PROOF_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Screenshot is too large. Maximum size is 8MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Please submit a valid image upload." }, { status: 400 });
  }

  const appointmentId = String(form.get("appointmentId") || "");
  const customerPhone = String(form.get("customerPhone") || "");
  const amountType = String(form.get("amountType") || "");
  const file = form.get("file");
  if (!appointmentId || customerPhone.length < 9 || !["deposit", "full"].includes(amountType) || !(file instanceof File)) {
    return NextResponse.json({ error: "Please provide the booking details, payment type and screenshot." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
    return NextResponse.json({ error: "Screenshot is too large. Maximum size is 8MB." }, { status: 413 });
  }
  if (!supportedTypes.has(file.type)) {
    return NextResponse.json({ error: "Upload a JPG, PNG or WEBP screenshot." }, { status: 415 });
  }

  if (!checkRateLimit(`${ipKey}:${appointmentId}`, 4, 10 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many uploads for this booking. Please wait before trying again." }, { status: 429 });
  }

  const session = await getSession();
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId));
  const owns = session?.role === "customer" && appointment?.customerId === session.userId;
  const phoneMatches = appointment ? phoneMatchesAppointment(appointment.customerPhone, customerPhone) : false;
  if (!appointment || appointment.source !== "online" || (!owns && !phoneMatches)) {
    return NextResponse.json({ error: "We couldn't verify this booking." }, { status: 404 });
  }
  if (appointment.status !== "pending") {
    return NextResponse.json({ error: "This booking is no longer awaiting payment proof." }, { status: 409 });
  }

  const type = amountType as ProofAmountType;
  const amount = deriveProofAmount(appointment, type);
  if (amount == null) {
    return NextResponse.json({ error: type === "deposit" ? "There is no deposit due for this booking." : "There is no outstanding amount due." }, { status: 400 });
  }

  const pendingPayments = await db.select({ id: payments.id }).from(payments).where(
    and(eq(payments.appointmentId, appointment.id), eq(payments.status, "pending")),
  );
  if (pendingPayments.length > 0) {
    return NextResponse.json({ error: "A payment for this booking is already awaiting salon review." }, { status: 409 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedType = imageMimeFromMagicBytes(bytes);
  if (!detectedType || detectedType !== file.type) {
    return NextResponse.json({ error: "The screenshot content did not match its image type. Please choose a JPG, PNG or WEBP image." }, { status: 415 });
  }

  const [proof] = await db.insert(paymentProofs).values({
    appointmentId: appointment.id,
    amountType: type,
    amount,
    mimeType: detectedType,
    data: bytes,
  }).returning({ id: paymentProofs.id });

  return NextResponse.json({ proofId: proof.id, amount, amountType: type }, {
    status: 201,
    headers: { "Cache-Control": "no-store, private" },
  });
}
