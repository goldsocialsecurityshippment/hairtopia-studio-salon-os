import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertClientAccess } from "@/lib/crm";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Uploads a CLIENT photo (before/after/inspiration) to storage OUTSIDE
 * `/public`, unlike the general `/api/upload` route. This is the fix for
 * the previously-disclosed gap: a private client photo's file can no
 * longer be fetched by anyone who guesses/obtains the URL — every read
 * goes through `/api/client-photos/[filename]`, which re-checks
 * `assertClientAccess` against the current session on every request.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  const { checkRateLimit } = await import("@/lib/rate-limit");
  if (!checkRateLimit(`upload:${session.userId}`, 30, 10 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Too many uploads. Please wait a moment." }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string | null;
  if (!file || !clientId) {
    return NextResponse.json({ error: "A file and clientId are required." }, { status: 400 });
  }

  const access = await assertClientAccess(session, clientId);
  if (!access.allowed || (access.scope !== "full" && access.scope !== "assigned")) {
    return NextResponse.json({ error: "You do not have permission to upload photos for this client." }, { status: 403 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Please upload a JPG, PNG or WEBP image." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 15MB." }, { status: 400 });
  }

  // IMPORTANT: this directory is NOT under /public — Next.js never serves
  // it directly, so there is no predictable public URL for these files.
  const privateDir = path.join(process.cwd(), "private-uploads", "client-photos");
  await mkdir(privateDir, { recursive: true });

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(privateDir, filename), bytes);

  // The "url" stored on the client_photos row is this authenticated route,
  // not a static file path.
  return NextResponse.json({ url: `/api/client-photos/${filename}` });
}
