/**
 * Adds the 13 "Natural Hair Services" from the V2 spec as a new service
 * category. This is a ONE-OFF, IDEMPOTENT addition — safe to run against
 * the live production database: it checks for an existing category with
 * this name first and does nothing if it's already there. It never touches
 * or removes any existing service/category.
 *
 * Prices/durations below are reasonable starting placeholders — the owner
 * should review and adjust them from /admin/services before going live,
 * the same way any other service is edited.
 *
 * Run with: npx tsx scripts/seed-natural-hair-services.ts
 */
import { db as defaultDb } from "../src/db";
import { serviceCategories, services } from "../src/db/schema";
import { eq } from "drizzle-orm";

const CATEGORY_NAME = "Natural Hair Services";

const NATURAL_HAIR_SERVICES: { name: string; priceMin: number; duration: number; description: string }[] = [
  { name: "Hair Assessment & Consulting", priceMin: 80, duration: 30, description: "In-depth assessment of hair and scalp health with personalized care recommendations." },
  { name: "Pre-Poo & Hair Wash", priceMin: 120, duration: 45, description: "Pre-shampoo treatment followed by a gentle, thorough wash." },
  { name: "Organic Detangling & Hair Wash", priceMin: 150, duration: 60, description: "Careful detangling with organic products, followed by a full wash." },
  { name: "Anti-Shedding Treatment", priceMin: 200, duration: 60, description: "Targeted treatment to reduce excessive shedding and strengthen roots." },
  { name: "Anti-Breakage Treatment", priceMin: 200, duration: 60, description: "Strengthening treatment to reduce breakage along the hair shaft." },
  { name: "Organic Protein Treatment", priceMin: 220, duration: 60, description: "Protein-based organic treatment to rebuild and strengthen strands." },
  { name: "Scalp & Hair Detox", priceMin: 180, duration: 50, description: "Deep-cleansing detox to clear product buildup and refresh the scalp." },
  { name: "Curl Definition", priceMin: 220, duration: 75, description: "Styling service that enhances and defines natural curl patterns." },
  { name: "Juicy Twists", priceMin: 350, duration: 150, description: "Moisturized, defined two-strand twists." },
  { name: "Bantu Knots", priceMin: 250, duration: 90, description: "Classic sectioned Bantu knot styling." },
  { name: "Twist-Out", priceMin: 200, duration: 75, description: "Twist-out styling for defined, voluminous curls." },
  { name: "Updos", priceMin: 250, duration: 60, description: "Elegant updo styling for natural hair." },
  { name: "Wash N' Go", priceMin: 180, duration: 60, description: "Low-manipulation wash-and-go styling for natural curls." },
];

/**
 * Idempotent — safe to call repeatedly or against a live database. Called
 * automatically by `npm run db:seed` (see scripts/seed.ts) so the Natural
 * Hair Services category always exists after the normal setup command,
 * with no separate script to remember to run. Also still runnable on its
 * own (see the bottom of this file) for an existing production database
 * that was seeded before this was merged in.
 */
export async function seedNaturalHairServices(db: typeof defaultDb = defaultDb) {
  const [existing] = await db.select().from(serviceCategories).where(eq(serviceCategories.name, CATEGORY_NAME));

  let categoryId: string;
  if (existing) {
    console.log(`"${CATEGORY_NAME}" category already exists — reusing it, no duplicate created.`);
    categoryId = existing.id;
  } else {
    const [maxSort] = await db.select().from(serviceCategories);
    const [created] = await db
      .insert(serviceCategories)
      .values({ name: CATEGORY_NAME, sortOrder: (maxSort ? 999 : 0) })
      .returning();
    categoryId = created.id;
    console.log(`Created category "${CATEGORY_NAME}".`);
  }

  const existingServices = await db.select().from(services).where(eq(services.categoryId, categoryId));
  let added = 0;
  for (const svc of NATURAL_HAIR_SERVICES) {
    if (existingServices.some((s) => s.name === svc.name)) continue;
    await db.insert(services).values({
      categoryId,
      name: svc.name,
      description: svc.description,
      priceMin: svc.priceMin,
      durationMinutes: svc.duration,
      bufferMinutes: 10,
      active: true,
    });
    added++;
  }
  console.log(`Added ${added} new service(s); ${NATURAL_HAIR_SERVICES.length - added} already existed.`);
}

// Standalone CLI entry point: `npx tsx scripts/seed-natural-hair-services.ts`
const isMain = process.argv[1]?.endsWith("seed-natural-hair-services.ts");
if (isMain) {
  (async () => {
    try {
      await seedNaturalHairServices();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

