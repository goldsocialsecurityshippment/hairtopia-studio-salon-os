import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { galleryImages } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { decodeStoredGalleryImage } from "@/lib/gallery-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const [image] = await db
    .select({
      mediaUrl: galleryImages.mediaUrl,
      mediaType: galleryImages.mediaType,
      active: galleryImages.active,
    })
    .from(galleryImages)
    .where(eq(galleryImages.id, params.id))
    .limit(1);

  if (!image || image.mediaType !== "image") {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (!image.active) {
    const session = await getSession();
    if (!session || !["owner", "admin", "manager"].includes(session.role)) {
      return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
  }

  const bytes = decodeStoredGalleryImage(image.mediaUrl);
  if (!bytes) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline; filename=\"gallery.webp\"",
      "Cache-Control": image.active ? "public, max-age=3600" : "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
