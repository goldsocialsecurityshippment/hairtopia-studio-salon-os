import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Handles file uploads for customer reference material and stylist completed-work
 * photos. Stores under /public/uploads locally. To move to Cloudinary or another
 * provider later, swap the body of this handler only — call sites are unaffected.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "You must be signed in to upload files." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
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
