import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const databaseUrl = process.env.NEON_DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { ok: false, error: "NEON_DATABASE_URL is missing" },
        { status: 500 }
      );
    }

    const sql = neon(databaseUrl);

    const rows = await sql`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        COUNT(*)::int AS user_count
      FROM users
    `;

    return NextResponse.json({
      ok: true,
      database: rows[0]?.database_name ?? null,
      schema: rows[0]?.schema_name ?? null,
      userCount: rows[0]?.user_count ?? null,
    });
  } catch (error) {
    console.error("Production database diagnostic failed:", error);

    return NextResponse.json(
      { ok: false, error: "Database diagnostic failed" },
      { status: 500 }
    );
  }
}
