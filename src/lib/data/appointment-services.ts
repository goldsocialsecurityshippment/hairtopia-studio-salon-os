import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appointmentServices, appointments, services, serviceVariations } from "@/db/schema";

type AppointmentRecord = typeof appointments.$inferSelect;

export type AppointmentServiceLine = {
  id: string;
  serviceId: string;
  serviceName: string;
  variationLabel: string | null;
  price: number;
  durationMinutes: number;
  acceptedTermsId: string | null;
  acceptedTermsVersion: number | null;
  acceptedTermsAt: string | null;
  minPrice: number;
  maxPrice: number;
  hasPriceRange: boolean;
};

/** Reads the immutable per-service snapshots for a combined appointment.
 * The legacy fallback keeps old records readable during/after the additive rollout. */
export async function getAppointmentServiceLines(appointment: AppointmentRecord): Promise<AppointmentServiceLine[]> {
  const rows = await db
    .select({ line: appointmentServices, service: services })
    .from(appointmentServices)
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(eq(appointmentServices.appointmentId, appointment.id))
    .orderBy(asc(appointmentServices.sortOrder));

  if (rows.length === 0) {
    const [service] = await db.select().from(services).where(eq(services.id, appointment.serviceId));
    if (!service) return [];
    const variation = appointment.variationId
      ? (await db.select().from(serviceVariations).where(eq(serviceVariations.id, appointment.variationId)))[0]
      : null;
    const hasPriceRange = !variation && service.priceMax != null && service.priceMax > service.priceMin;
    return [{
      id: `${appointment.id}:legacy`,
      serviceId: service.id,
      serviceName: service.name,
      variationLabel: variation?.label ?? null,
      price: appointment.priceEstimate,
      durationMinutes: appointment.durationMinutes,
      acceptedTermsId: appointment.acceptedTermsId,
      acceptedTermsVersion: appointment.acceptedTermsVersion,
      acceptedTermsAt: appointment.acceptedTermsAt,
      minPrice: variation?.price ?? service.priceMin,
      maxPrice: variation?.price ?? service.priceMax ?? service.priceMin,
      hasPriceRange,
    }];
  }

  const variationIds = rows.map(({ line }) => line.variationId).filter((id): id is string => !!id);
  const variations = variationIds.length
    ? await db.select().from(serviceVariations).where(inArray(serviceVariations.id, variationIds))
    : [];
  return rows.map(({ line, service }) => {
    const variation = variations.find((candidate) => candidate.id === line.variationId);
    const hasPriceRange = !variation && service.priceMax != null && service.priceMax > service.priceMin;
    return {
      id: line.id,
      serviceId: service.id,
      serviceName: service.name,
      variationLabel: variation?.label ?? null,
      price: line.price,
      durationMinutes: line.durationMinutes,
      acceptedTermsId: line.acceptedTermsId,
      acceptedTermsVersion: line.acceptedTermsVersion,
      acceptedTermsAt: line.acceptedTermsAt,
      minPrice: variation?.price ?? service.priceMin,
      maxPrice: variation?.price ?? service.priceMax ?? service.priceMin,
      hasPriceRange,
    };
  });
}
