import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentProofs } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!["manager", "owner", "admin"].includes(session.role)) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const [proof] = await db.select({ data: paymentProofs.data, mimeType: paymentProofs.mimeType })
    .from(paymentProofs).where(eq(paymentProofs.id, params.id));
  if (!proof) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  return new NextResponse(new Uint8Array(proof.data), {
    status: 200,
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(proof.data.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
