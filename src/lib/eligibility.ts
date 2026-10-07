import { db } from "@/db";
import { stylistServices, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * The single server-side source of truth for "may this professional
 * perform this service?" — backed by the same `stylist_services` rows the
 * admin assigns on the staff profile page. Every code path that assigns a
 * professional to an appointment (online booking, walk-in, queue
 * assignment, reschedule, consultation conversion) must go through this;
 * the booking wizard's own filter is only a convenience for the UI and
 * must never be the only enforcement, since a crafted request bypasses it.
 */
export async function isStylistEligible(stylistId: string, serviceId: string): Promise<boolean> {
  const [stylist] = await db.select().from(users).where(eq(users.id, stylistId));
  if (!stylist || stylist.role !== "stylist" || !stylist.active) return false;

  const [link] = await db
    .select()
    .from(stylistServices)
    .where(and(eq(stylistServices.stylistId, stylistId), eq(stylistServices.serviceId, serviceId)));
  return Boolean(link);
}

export const INELIGIBLE_STYLIST_ERROR =
  "That professional isn't available for this service. Please choose another professional.";
