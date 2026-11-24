import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !["manager", "owner", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const identifier = "nikinuel@gmail.com";

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.phone, identifier)));

    return NextResponse.json({
      ok: true,
      found: !!user,
      role: user?.role ?? null,
      active: user?.active ?? null,
      name: user?.name ?? null,
    });
  } catch (error) {
    console.error("Drizzle authentication diagnostic failed:", error);

    return NextResponse.json(
      { ok: false, error: "Drizzle diagnostic failed" },
      { status: 500 }
    );
  }
}
