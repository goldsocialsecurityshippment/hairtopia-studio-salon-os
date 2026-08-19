import { db } from "@/db";
import {
  serviceCategories,
  services,
  serviceVariations,
  users,
  staffProfiles,
  stylistServices,
  reviews,
  appointments,
  salonSettings,
  galleryImages,
} from "@/db/schema";
import { eq, and, avg, count } from "drizzle-orm";

export async function getSettings() {
  const [settings] = await db.select().from(salonSettings).where(eq(salonSettings.id, "main"));
  return settings;
}

export async function getCategoriesWithServices() {
  const categories = await db.select().from(serviceCategories).orderBy(serviceCategories.sortOrder);
  const allServices = await db.select().from(services).where(eq(services.active, true));
  const allVariations = await db.select().from(serviceVariations).where(eq(serviceVariations.active, true));

  return categories.map((cat) => ({
    ...cat,
    services: allServices
      .filter((s) => s.categoryId === cat.id)
      .map((s) => ({
        ...s,
        variations: allVariations.filter((v) => v.serviceId === s.id),
      })),
  }));
}

export async function getActiveStylists() {
  const stylists = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "stylist"), eq(users.active, true)));

  const profiles = await db.select().from(staffProfiles);
  const links = await db.select().from(stylistServices);

  const ratings = await db
    .select({
      stylistId: appointments.stylistId,
      avgRating: avg(reviews.overallRating),
      reviewCount: count(reviews.id),
    })
    .from(reviews)
    .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
    .where(eq(reviews.hidden, false))
    .groupBy(appointments.stylistId);

  return stylists.map((s) => {
    const profile = profiles.find((p) => p.userId === s.id);
    const serviceIds = links.filter((l) => l.stylistId === s.id).map((l) => l.serviceId);
    const ratingRow = ratings.find((r) => r.stylistId === s.id);
    return {
      ...s,
      profile,
      serviceIds,
      avgRating: ratingRow?.avgRating ? Number(ratingRow.avgRating) : null,
      reviewCount: ratingRow?.reviewCount ?? 0,
    };
  });
}

export async function getStylistsForService(serviceId: string) {
  const all = await getActiveStylists();
  return all.filter((s) => s.serviceIds.includes(serviceId));
}

export async function getServiceById(serviceId: string) {
  const [service] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!service) return null;
  const variations = await db
    .select()
    .from(serviceVariations)
    .where(and(eq(serviceVariations.serviceId, serviceId), eq(serviceVariations.active, true)));
  return { ...service, variations };
}

export async function getGalleryImages() {
  const rows = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.active, true))
    .orderBy(galleryImages.sortOrder);
  return rows;
}

export async function getPublishedReviews(limit = 6) {
  const rows = await db
    .select({
      review: reviews,
      appointment: appointments,
    })
    .from(reviews)
    .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
    .where(eq(reviews.hidden, false));

  return rows
    .sort((a, b) => (b.review.createdAt > a.review.createdAt ? 1 : -1))
    .slice(0, limit);
}
