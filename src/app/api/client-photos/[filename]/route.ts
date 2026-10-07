import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertClientAccess } from "@/lib/crm";
import { db } from "@/db";
import { clientPhotos } from "@/db/schema";
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
 * Serves a private client photo ONLY after checking the current session's
 * access to that specific client, on every single request — this is the
 * server-side enforcement the storage layer itself doesn't provide. A
 * `public` + approved photo is servable to anyone (that's the point of
 * marking it public); anything else requires `full` or `assigned` scope.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const url = `/api/client-photos/${filename}`;

  const [photo] = await db.select().from(clientPhotos).where(eq(clientPhotos.url, url));
  if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!(photo.visibility === "public" && photo.publicApproved)) {
    const session = await getSession();
    const access = await assertClientAccess(session, photo.clientId);
    if (!access.allowed || (access.scope !== "full" && access.scope !== "assigned")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = path.join(process.cwd(), "private-uploads", "client-photos", filename);

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
