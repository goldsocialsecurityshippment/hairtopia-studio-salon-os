import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { imageMimeFromMagicBytes } from "@/lib/payment-proofs";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_BOOKING_REFERENCE_REQUEST_BYTES = 8 * 1024 * 1024 + 64 * 1024;

async function readLimitedMultipartForm(req: NextRequest): Promise<FormData> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("UPLOAD_INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BOOKING_REFERENCE_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("UPLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const response = new Response(body, {
    headers: { "Content-Type": req.headers.get("content-type") || "" },
  });
  return response.formData();
}

/**
 * Handles file uploads for customer reference material and stylist completed-work
 * photos. Stores under /public/uploads locally. To move to Cloudinary or another
 * provider later, swap the body of this handler only — call sites are unaffected.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const bookingReference = req.nextUrl.searchParams.get("purpose") === "booking-reference";
  if (!session && !bookingReference) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }
  if (bookingReference) {
    const ipKey = clientKeyFromHeaders(req.headers, "booking-reference-upload");
    if (!checkRateLimit(ipKey, 8, 10 * 60 * 1000).allowed) {
      return NextResponse.json({ error: "Too many photo uploads. Please wait a few minutes." }, { status: 429 });
    }
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BOOKING_REFERENCE_REQUEST_BYTES) {
      return NextResponse.json({ error: "Photo is too large. Maximum size is 8MB." }, { status: 413 });
    }
  }

  let formData: FormData;
  try {
    formData = bookingReference ? await readLimitedMultipartForm(req) : await req.formData();
  } catch (error) {
    if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "Photo is too large. Maximum size is 8MB." }, { status: 413 });
    }
    return NextResponse.json({ error: "Please submit a valid file upload." }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }

  if (bookingReference) {
    const allowedReferenceTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedReferenceTypes.has(file.type)) {
      return NextResponse.json({ error: "Booking reference photos must be JPG, PNG or WEBP images." }, { status: 415 });
    }
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Photo is too large. Maximum size is 8MB." }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedType = imageMimeFromMagicBytes(bytes);
    if (detectedType !== file.type) {
      return NextResponse.json({ error: "The photo content did not match its image type." }, { status: 415 });
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const filename = `${crypto.randomUUID()}.${extension}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, filename), bytes);
    return NextResponse.json({ url: `/uploads/${filename}` }, { headers: { "Cache-Control": "no-store" } });
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a JPG, PNG, WEBP, GIF, MP4, WEBM or MOV file." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 15MB." }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const ext = file.name.split(".").pop() || (isImage ? "jpg" : "mp4");
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, bytes);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
