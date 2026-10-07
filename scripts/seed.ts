import { db } from "../src/db";
import {
  serviceCategories,
  services,
  serviceVariations,
  users,
  staffProfiles,
  customerProfiles,
  stylistServices,
  availability,
  salonSettings,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { eq } from "drizzle-orm";

type SeedService = {
  name: string;
  priceMin: number;
  priceMax?: number;
  duration?: number;
  variations?: { label: string; price: number }[];
};

type SeedCategory = { name: string; services: SeedService[] };

// Real Hairtopia Studio pricing supplied by the client (Aug 2026).
const CATALOGUE: SeedCategory[] = [
  {
    name: "Hair Wash / Care",
    services: [
      { name: "Mizani", priceMin: 220, priceMax: 250, duration: 60 },
      { name: "Shea Butter", priceMin: 120, priceMax: 150, duration: 45 },
      { name: "Hair Trimming", priceMin: 50, duration: 20 },
      { name: "Natural Hair Wash", priceMin: 150, duration: 45 },
      { name: "Natural Hair Wash & Twist", priceMin: 200, duration: 75 },
      { name: "Wig Base Cornrow", priceMin: 50, priceMax: 80, duration: 40 },
      { name: "Detangling", priceMin: 30, priceMax: 50, duration: 30 },
      { name: "Blow Drying", priceMin: 50, duration: 30 },
      { name: "Braid Loosing", priceMin: 50, priceMax: 100, duration: 45 },
      { name: "Weave Loosing", priceMin: 50, duration: 30 },
    ],
  },
  {
    name: "Retouch",
    services: [
      { name: "Mizani Sensitive Relaxing", priceMin: 300, priceMax: 380, duration: 90 },
      { name: "Mizani Butter Blend Relaxing", priceMin: 270, priceMax: 380, duration: 90 },
      { name: "Shea Butter Relaxer & Others", priceMin: 250, duration: 90 },
      { name: "Extra Pack", priceMin: 50, duration: 15 },
      { name: "Personal Relaxer", priceMin: 170, duration: 75 },
    ],
  },
  {
    name: "Styling",
    services: [
      { name: "Hair Wash + Pony", priceMin: 250, duration: 60 },
      { name: "Natural Hair Wash + Pony", priceMin: 270, duration: 75 },
      { name: "Natural Pony Without Wash", priceMin: 170, duration: 45 },
      { name: "Curling", priceMin: 200, duration: 60 },
      { name: "Straightening", priceMin: 120, duration: 45 },
      { name: "Closure Wigcap", priceMin: 200, duration: 60 },
      { name: "Frontal Wigcap", priceMin: 280, duration: 75 },
      { name: "Sew-in", priceMin: 300, duration: 120 },
      { name: "Crochet", priceMin: 350, duration: 150 },
      { name: "Revamping — Straight", priceMin: 200, duration: 90 },
      { name: "Revamping — Curly", priceMin: 300, duration: 105 },
    ],
  },
  {
    name: "Hair Treatment",
    services: [
      { name: "Dandruff Treatment", priceMin: 300, duration: 60 },
      { name: "Oil Treatment", priceMin: 260, duration: 45 },
      { name: "Deep Conditioning", priceMin: 270, duration: 45 },
    ],
  },
  {
    name: "Braids — Spiral",
    services: [
      {
        name: "Spiral Braids",
        priceMin: 400,
        priceMax: 600,
        duration: 240,
        variations: [
          { label: "6 rows", price: 400 },
          { label: "7 rows", price: 500 },
          { label: '12" / 7 rows', price: 400 },
          { label: "8 rows", price: 600 },
        ],
      },
    ],
  },
  {
    name: "Braids — Layered",
    services: [
      {
        name: "Layered Braids",
        priceMin: 300,
        priceMax: 580,
        duration: 240,
        variations: [
          { label: "6 rows", price: 325 },
          { label: "7 rows", price: 400 },
          { label: "8 rows", price: 580 },
        ],
      },
    ],
  },
  {
    name: "Braids — Knotless",
    services: [
      {
        name: "Knotless Braids",
        priceMin: 280,
        priceMax: 720,
        duration: 300,
        variations: [
          { label: "Medium / 6 rows / Bottom Layer (BL)", price: 340 },
          { label: "Medium / 6 rows / Waist Layer (WL)", price: 380 },
          { label: "Medium / 6 rows / Hip Layer (HL/HIL)", price: 480 },
          { label: "Medium / 5 rows / Bottom Layer (BL)", price: 320 },
          { label: "Medium / 5 rows / Waist Layer (WL)", price: 360 },
          { label: "Medium / 5 rows / Hip Layer (HL)", price: 400 },
          { label: "Large / 4 rows / Waist Layer (WL)", price: 280 },
          { label: "Large / 4 rows / Hip Layer (HL)", price: 350 },
          { label: "Small / 7 rows / Bottom Layer (BL)", price: 440 },
          { label: "Small / 7 rows / Waist Layer (WL)", price: 480 },
          { label: "Small / 7 rows / Hip Layer (HL)", price: 520 },
          { label: "Extra Small / 8 rows / Bottom Layer (BL)", price: 490 },
          { label: "Extra Small / 8 rows / Waist Layer (WL)", price: 580 },
          { label: "Extra Small / 8 rows / Hip Layer (HL)", price: 620 },
          { label: "Extra Small / 9 rows / Bottom Layer (BL)", price: 560 },
          { label: "Extra Small / 9 rows / Waist Layer (WL)", price: 640 },
          { label: "Extra Small / 9 rows / Hip Layer (HL)", price: 720 },
        ],
      },
    ],
  },
  {
    name: "Braids — Boho & Stitch",
    services: [
      {
        name: "Boho Braids",
        priceMin: 80,
        priceMax: 170,
        duration: 180,
        variations: [
          { label: "Standard", price: 100 },
          { label: "With gel (+GH₵50)", price: 150 },
        ],
      },
      {
        name: "Stitch Cornrow",
        priceMin: 300,
        priceMax: 400,
        duration: 120,
        variations: [
          { label: "1 extension / 6 rows", price: 300 },
          { label: "1 extension / 8 rows", price: 400 },
        ],
      },
      { name: "Men's Stitch Braids", priceMin: 30, duration: 30 },
    ],
  },
  {
    name: "Nails",
    services: [
      { name: "Nail Polish", priceMin: 80, duration: 30 },
      { name: "Stick-on — Short", priceMin: 150, duration: 45 },
      { name: "Stick-on — Medium", priceMin: 180, duration: 45 },
      { name: "Stick-on — Long", priceMin: 210, duration: 60 },
      { name: "Acrylic — Short", priceMin: 200, duration: 60 },
      { name: "Acrylic — Medium", priceMin: 250, duration: 75 },
      { name: "Acrylic — Long", priceMin: 280, duration: 90 },
      { name: "BIAB (without extensions)", priceMin: 150, duration: 60 },
      { name: "Polygel", priceMin: 200, duration: 75 },
      { name: "Nail Refill", priceMin: 150, duration: 45 },
    ],
  },
  {
    name: "Pedicure",
    services: [
      { name: "Standard Pedicure", priceMin: 250, duration: 45 },
      { name: "Premium Pedicure", priceMin: 300, duration: 60 },
      { name: "Luxury / Jelly Pedicure", priceMin: 350, duration: 75 },
    ],
  },
  {
    name: "Extra Nail Designs",
    services: [
      { name: "Nail Art (per finger)", priceMin: 5, duration: 10 },
      { name: "French Tips (per finger)", priceMin: 10, duration: 10 },
    ],
  },
  {
    name: "Wigs & Installations",
    services: [
      { name: "Wig Installation", priceMin: 200, duration: 90 },
      { name: "Wig Revamp", priceMin: 250, duration: 90 },
      { name: "Braiding Extensions & Bundles", priceMin: 100, duration: 30 },
      { name: "Cluster Lash", priceMin: 150, duration: 60 },
    ],
  },
];

async function main() {
  console.log("Seeding Hairtopia Studio database...");

  // Salon settings — single row, real client-supplied details.
  await db
    .insert(salonSettings)
    .values({
      id: "main",
      name: "Hairtopia Studio",
      address: "266 Afro Osro Street",
      mapUrl: "https://maps.app.goo.gl/2SNPw3nXURoRZV4T8?g_st=ic",
      email: "nikinuel@gmail.com",
      instagram: "@Hairtopia_Studio",
      facebook: "Hairtopia",
      openTime: "08:30",
      closeTime: "19:30",
      checkInRadiusMeters: 100,
      attendanceGracePeriodMinutes: 10,
      cancellationPolicy: "Please cancel at least 2 hours before your appointment where possible.",
      noShowGraceMinutes: 20,
      depositEnabled: false,
      depositPercent: 20,
      bookingBufferMinutes: 15,
    })
    .onConflictDoNothing();

  // Service catalogue
  for (const cat of CATALOGUE) {
    const [category] = await db.insert(serviceCategories).values({ name: cat.name }).returning();
    for (const svc of cat.services) {
      const [service] = await db
        .insert(services)
        .values({
          categoryId: category.id,
          name: svc.name,
          priceMin: svc.priceMin,
          priceMax: svc.priceMax ?? null,
          durationMinutes: svc.duration ?? 60,
        })
        .returning();

      if (svc.variations?.length) {
        await db.insert(serviceVariations).values(
          svc.variations.map((v, i) => ({
            serviceId: service.id,
            label: v.label,
            price: v.price,
            isDefault: i === 0,
          }))
        );
      }
    }
  }

  const allServices = await db.select().from(services);

  // Demo accounts — clearly fictional, for local development only.
  const ownerPassword = await hashPassword("owner123");
  const [owner] = await db
    .insert(users)
    .values({
      role: "owner",
      name: "Nikita Nuel",
      email: "nikinuel@gmail.com",
      phone: "0240000001",
      passwordHash: ownerPassword,
    })
    .returning();

  const managerPassword = await hashPassword("manager123");
  const [manager] = await db
    .insert(users)
    .values({
      role: "manager",
      name: "Abena Mensah",
      phone: "0240000002",
      passwordHash: managerPassword,
    })
    .returning();
  await db.insert(staffProfiles).values({ userId: manager.id, hireDate: "2025-01-10" });

  const stylistPassword = await hashPassword("stylist123");
  const stylistSeed = [
    { name: "Ama Owusu", phone: "0240000003", specialties: "Knotless braids, spiral braids", years: 5 },
    { name: "Akosua Boateng", phone: "0240000004", specialties: "Retouch, styling, wigs", years: 7 },
    { name: "Adwoa Serwaa", phone: "0240000005", specialties: "Nails, pedicure", years: 3 },
  ];

  const seededStylists = [];
  for (const s of stylistSeed) {
    const [user] = await db
      .insert(users)
      .values({ role: "stylist", name: s.name, phone: s.phone, passwordHash: stylistPassword })
      .returning();
    await db.insert(staffProfiles).values({
      userId: user.id,
      specialties: s.specialties,
      yearsExperience: s.years,
      hireDate: "2024-06-01",
      scheduledStart: "08:30",
    });
    // Each stylist is assigned to a broad slice of services so booking has real coverage.
    const relevant = allServices.filter((svc) =>
      s.specialties.toLowerCase().split(", ").some((spec) => svc.name.toLowerCase().includes(spec.split(" ")[0]))
    );
    const assign = relevant.length > 0 ? relevant : allServices.slice(0, 15);
    await db.insert(stylistServices).values(assign.map((svc) => ({ stylistId: user.id, serviceId: svc.id })));

    const days = [1, 2, 3, 4, 5, 6];
    await db.insert(availability).values(
      days.map((d) => ({ stylistId: user.id, dayOfWeek: d, startTime: "08:30", endTime: "19:30" }))
    );
    seededStylists.push(user);
  }

  // Give every stylist every service too, so the booking demo isn't limited (owner can refine later).
  for (const stylist of seededStylists) {
    const already = await db.select().from(stylistServices).where(eq(stylistServices.stylistId, stylist.id));
    const alreadyIds = new Set(already.map((r) => r.serviceId));
    const missing = allServices.filter((s) => !alreadyIds.has(s.id));
    if (missing.length) {
      await db.insert(stylistServices).values(missing.map((s) => ({ stylistId: stylist.id, serviceId: s.id })));
    }
  }

  const customerPassword = await hashPassword("customer123");
  const [customer] = await db
    .insert(users)
    .values({ role: "customer", name: "Mary Asante", phone: "0240000006", passwordHash: customerPassword })
    .returning();
  await db.insert(customerProfiles).values({ userId: customer.id });

  // V2 additions — idempotent, so running `db:seed` again never duplicates
  // these. This is also what makes them appear automatically with the
  // normal setup command, with no separate script to remember to run.
  const { seedNaturalHairServices } = await import("./seed-natural-hair-services");
  const { seedMakeupServices } = await import("./seed-makeup-services");
  await seedNaturalHairServices(db);
  await seedMakeupServices(db);

  console.log("Seed complete.");
  console.log("---");
  console.log("Demo accounts (local dev only):");
  console.log(`Owner:    ${owner.phone} / owner123`);
  console.log(`Manager:  ${manager.phone} / manager123`);
  console.log(`Stylist:  ${stylistSeed[0].phone} / stylist123 (and other stylist numbers above)`);
  console.log(`Customer: ${customer.phone} / customer123`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

