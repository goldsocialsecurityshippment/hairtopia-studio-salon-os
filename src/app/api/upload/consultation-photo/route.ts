import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Consultation reference/inspiration photos, uploaded from the public
 * consultation request form (no login required to request a
 * consultation — same as V1's public booking flow). Stored OUTSIDE
 * `/public`, same principle as client photos: no predictable public URL,
 * every read goes through the authenticated `/api/consultation-photos/
 * [filename]` route.
 */
export async function POST(req: NextRequest) {
  const { checkRateLimit, clientKeyFromHeaders } = await import("@/lib/rate-limit");
  if (!checkRateLimit(clientKeyFromHeaders(req.headers, "consult-upload"), 15, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many uploads from this connection. Please wait a moment." }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "A file is required." }, { status: 400 });

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Please upload a JPG, PNG or WEBP image." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 15MB." }, { status: 400 });
  }

  const privateDir = path.join(process.cwd(), "private-uploads", "consultation-photos");
  await mkdir(privateDir, { recursive: true });

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(privateDir, filename), bytes);

  return NextResponse.json({ url: `/api/consultation-photos/${filename}` });
}
