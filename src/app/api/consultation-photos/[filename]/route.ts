import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db";
import { consultations, consultationPhotos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Serves a consultation reference photo only to authorized staff: Owner,
 * Trusted Admin, Manager (who can review any consultation), or the
 * specific professional the customer named on the request. Same principle
 * as `/api/client-photos/[filename]` — checked on every request, not just
 * hidden in the UI.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const url = `/api/consultation-photos/${filename}`;

  const [photo] = await db.select().from(consultationPhotos).where(eq(consultationPhotos.url, url));
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [consultation] = await db.select().from(consultations).where(eq(consultations.id, photo.consultationId));
  const session = await getSession();
  const isBackOffice = session && ["owner", "admin", "manager"].includes(session.role);
  const isNamedProfessional = session && consultation?.requestedStylistId === session.userId;

  if (!isBackOffice && !isNamedProfessional) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = path.join(process.cwd(), "private-uploads", "consultation-photos", filename);

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream", "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
