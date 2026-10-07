/**
 * Adds the "Makeup" service category with exactly the three services
 * specified: Soft Glam (GH₵200–300), Full Glam (GH₵350–450), and Bridal
 * Makeup (GH₵1,500 flat, "1 look") with an editable Terms & Conditions
 * record attached via `service_terms`.
 *
 * IDEMPOTENT — safe to run against a live database. Checks for the
 * category and each service/terms record by name/serviceId before
 * inserting; running this twice does not create duplicates.
 *
 * Run with: npx tsx scripts/seed-makeup-services.ts
 */
import { db as defaultDb } from "../src/db";
import { serviceCategories, services, serviceTerms } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

const CATEGORY_NAME = "Makeup";

const BRIDAL_TERMS = `Bridal Makeup — Terms & Conditions

1. A non-refundable GH₵100 booking deposit secures your Bridal Makeup appointment date and time.
2. Bridal Makeup covers one (1) complete look. A trial session, if desired, is booked and charged separately.
3. Please arrive with a clean, moisturized face. Any known allergies or skin sensitivities must be disclosed at booking.
4. Rescheduling requests must be made at least 7 days before the event date, subject to availability.
5. Hairtopia Studio is not liable for reactions to products not disclosed in advance by the client.
6. Final balance is due on the day of service, before the makeup application begins.`;

/**
 * Idempotent — safe to call repeatedly or against a live database. Called
 * automatically by `npm run db:seed` (see scripts/seed.ts), same reasoning
 * as seedNaturalHairServices: Makeup (Soft Glam / Full Glam / Bridal
 * Makeup + its Terms) should exist after the normal setup command with no
 * separate script to remember to run.
 */
export async function seedMakeupServices(db: typeof defaultDb = defaultDb) {
  const [existingCategory] = await db.select().from(serviceCategories).where(eq(serviceCategories.name, CATEGORY_NAME));

  let categoryId: string;
  if (existingCategory) {
    console.log(`"${CATEGORY_NAME}" category already exists — reusing it.`);
    categoryId = existingCategory.id;
  } else {
    const [created] = await db.insert(serviceCategories).values({ name: CATEGORY_NAME, sortOrder: 1000 }).returning();
    categoryId = created.id;
    console.log(`Created category "${CATEGORY_NAME}".`);
  }

  const existingServices = await db.select().from(services).where(eq(services.categoryId, categoryId));

  async function ensureService(name: string, priceMin: number, priceMax: number | undefined, duration: number, description: string) {
    const found = existingServices.find((s) => s.name === name);
    if (found) {
      console.log(`Service "${name}" already exists — skipping.`);
      return found.id;
    }
    const [created] = await db
      .insert(services)
      .values({ categoryId, name, description, priceMin, priceMax: priceMax ?? null, durationMinutes: duration, bufferMinutes: 15, active: true })
      .returning();
    console.log(`Added service "${name}".`);
    return created.id;
  }

  await ensureService(
    "Soft Glam",
    200,
    300,
    75,
    "Natural, everyday-elegant makeup application. Final price within GH₵200–300 is confirmed by staff based on products/complexity."
  );
  await ensureService(
    "Full Glam",
    350,
    450,
    90,
    "Bold, dramatic makeup application for events and photoshoots. Final price within GH₵350–450 is confirmed by staff."
  );
  const bridalId = await ensureService(
    "Bridal Makeup",
    1500,
    undefined,
    150,
    "1 look. A non-refundable deposit secures your date — see Terms & Conditions."
  );

  const [existingTerms] = await db
    .select()
    .from(serviceTerms)
    .where(and(eq(serviceTerms.serviceId, bridalId), eq(serviceTerms.active, true)));

  if (existingTerms) {
    console.log("Bridal Makeup terms already exist — leaving the current version in place.");
  } else {
    await db.insert(serviceTerms).values({
      serviceId: bridalId,
      version: 1,
      title: "Bridal Makeup — Terms & Conditions",
      content: BRIDAL_TERMS,
      active: true,
    });
    console.log("Added Bridal Makeup Terms & Conditions (v1).");
  }
}

// Standalone CLI entry point: `npx tsx scripts/seed-makeup-services.ts`
//
// IMPORTANT: this must NOT use a bare top-level `await` — even inside an
// `if` block that's false at runtime, a literal top-level `await` forces
// esbuild/tsx to transform this whole file as ESM-with-top-level-await,
// which fails in this project's CJS-leaning tsx/Node setup with
// "Top-level await is currently not supported with the 'cjs' output
// format" (ERR_REQUIRE_ASYNC_MODULE). That failure happens at TRANSFORM
// time, so it broke not just running this file directly, but also
// `npm run db:seed` itself, which dynamically imports this module —
// Makeup services silently never got seeded as a result. Wrapping in an
// async IIFE (as seed-natural-hair-services.ts already correctly does)
// keeps the `await` inside a function expression, not at the top level.
const isMain = process.argv[1]?.endsWith("seed-makeup-services.ts");
if (isMain) {
  (async () => {
    try {
      await seedMakeupServices();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

