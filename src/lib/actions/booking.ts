"use server";

import { db } from "@/db";
import {
  appointments,
  appointmentServices,
  appointmentStatusHistory,
  services,
  serviceVariations,
  availability,
  salonSettings,
  customerReferences,
  queueEntries,
  users,
  stylistServices,
  cancellations,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  getSession,
  requireRole,
} from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "arrived",
  "in_service",
] as const;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");

  const mins = (minutes % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${mins}`;
}

function getGhanaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
  }).format(new Date());
}

function getGhanaMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? 0
  );

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );

  return hour * 60 + minute;
}

function getDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTimeString(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/**
 * Returns available start times for a stylist
 * and multiple selected services.
 */
export async function getAvailableSlots(params: {
  stylistId: string;
  serviceIds: string[];
  date: string;
}) {
  if (
    !params.stylistId ||
    !params.date ||
    params.serviceIds.length === 0
  ) {
    return [];
  }

  if (!isValidDateString(params.date)) {
    return [];
  }

  /**
   * FIX:
   * Do not use [...new Set(...)] because the project's
   * TypeScript target does not support spreading Set.
   */
  const uniqueServiceIds = Array.from(
    new Set(params.serviceIds)
  );

  const [settings] = await db
    .select()
    .from(salonSettings)
    .where(eq(salonSettings.id, "main"));

  const selectedServices = await db
    .select()
    .from(services)
    .where(
      inArray(
        services.id,
        uniqueServiceIds
      )
    );

  if (
    selectedServices.length !==
    uniqueServiceIds.length
  ) {
    return [];
  }

  const inactiveService = selectedServices.find(
    (service) => !service.active
  );

  if (inactiveService) {
    return [];
  }

  /**
   * Make sure the stylist is assigned
   * to every requested service.
   */
  const stylistLinks = await db
    .select()
    .from(stylistServices)
    .where(
      eq(
        stylistServices.stylistId,
        params.stylistId
      )
    );

  const stylistServiceIds = stylistLinks.map(
    (link) => link.serviceId
  );

  const stylistCanPerformAll =
    uniqueServiceIds.every((serviceId) =>
      stylistServiceIds.includes(serviceId)
    );

  if (!stylistCanPerformAll) {
    return [];
  }

  const dayOfWeek = getDayOfWeek(params.date);

  const [dayAvailability] = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(
          availability.stylistId,
          params.stylistId
        ),
        eq(
          availability.dayOfWeek,
          dayOfWeek
        ),
        eq(
          availability.active,
          true
        )
      )
    );

  const openTime =
    dayAvailability?.startTime ??
    settings?.openTime ??
    "08:30";

  const closeTime =
    dayAvailability?.endTime ??
    settings?.closeTime ??
    "19:30";

  const existing = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(
          appointments.stylistId,
          params.stylistId
        ),
        eq(
          appointments.scheduledDate,
          params.date
        ),
        inArray(
          appointments.status,
          [...ACTIVE_STATUSES]
        )
      )
    );

  const totalDuration = selectedServices.reduce(
    (total, service) =>
      total + service.durationMinutes,
    0
  );

  const bookingBuffer =
    settings?.bookingBufferMinutes ?? 15;

  const startMin = timeToMinutes(openTime);
  const endMin = timeToMinutes(closeTime);

  const busyRanges = existing.map(
    (appointment) => {
      const start = timeToMinutes(
        appointment.scheduledTime
      );

      return {
        start,
        end:
          start +
          appointment.durationMinutes +
          bookingBuffer,
      };
    }
  );

  const slots: string[] = [];

  const isToday =
    params.date === getGhanaDate();

  const nowMinutes =
    getGhanaMinutes();

  const slotStep = 30;

  for (
    let start = startMin;
    start + totalDuration <= endMin;
    start += slotStep
  ) {
    if (
      isToday &&
      start <= nowMinutes
    ) {
      continue;
    }

    const slotEnd =
      start + totalDuration;

    const conflicts =
      busyRanges.some(
        (busy) =>
          start < busy.end &&
          slotEnd + bookingBuffer >
            busy.start
      );

    if (!conflicts) {
      slots.push(
        minutesToTime(start)
      );
    }
  }

  return slots;
}

/**
 * Service selected inside a booking.
 */
const bookingServiceSchema = z.object({
  serviceId: z.string().min(1),

  variationId: z
    .string()
    .min(1)
    .optional(),
});

/**
 * Online booking schema.
 */
const bookingSchema = z.object({
  services: z
    .array(bookingServiceSchema)
    .min(
      1,
      "Please choose at least one service."
    ),

  stylistId: z.string().min(1),

  date: z
    .string()
    .min(
      1,
      "Please choose a date."
    ),

  time: z
    .string()
    .min(
      1,
      "Please choose a time."
    ),

  customerName: z
    .string()
    .trim()
    .min(
      2,
      "Please enter your name."
    ),

  customerPhone: z
    .string()
    .trim()
    .min(
      9,
      "Please enter a valid phone number."
    ),

  instructions:
    z.string().optional(),

  referenceUrls: z
    .array(z.string().url())
    .optional(),
});

export type BookingResult =
  | {
      ok: true;
      appointmentId: string;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Creates one appointment containing
 * multiple services.
 */
export async function createAppointment(
  input: z.infer<typeof bookingSchema>
): Promise<BookingResult> {
  const parsed =
    bookingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]
          ?.message ??
        "Invalid booking information.",
    };
  }

  const data = parsed.data;

  if (
    !isValidDateString(data.date)
  ) {
    return {
      ok: false,
      error:
        "Please choose a valid date.",
    };
  }

  if (
    !isValidTimeString(data.time)
  ) {
    return {
      ok: false,
      error:
        "Please choose a valid time.",
    };
  }

  const today = getGhanaDate();

  if (data.date < today) {
    return {
      ok: false,
      error:
        "You cannot book a date in the past.",
    };
  }

  /**
   * FIX:
   * Array.from(new Set(...)) instead of
   * [...new Set(...)].
   */
  const uniqueServiceIds = Array.from(
    new Set(
      data.services.map(
        (service) =>
          service.serviceId
      )
    )
  );

  if (
    uniqueServiceIds.length !==
    data.services.length
  ) {
    return {
      ok: false,
      error:
        "A service can only be selected once per booking.",
    };
  }

  /**
   * Load selected services.
   */
  const selectedServices =
    await db
      .select()
      .from(services)
      .where(
        inArray(
          services.id,
          uniqueServiceIds
        )
      );

  if (
    selectedServices.length !==
    uniqueServiceIds.length
  ) {
    return {
      ok: false,
      error:
        "One or more selected services could not be found.",
    };
  }

  /**
   * Make sure every service is active.
   */
  const inactiveService =
    selectedServices.find(
      (service) => !service.active
    );

  if (inactiveService) {
    return {
      ok: false,
      error: `${inactiveService.name} is no longer available.`,
    };
  }

  /**
   * Verify stylist assignment.
   */
  const stylistLinks =
    await db
      .select()
      .from(stylistServices)
      .where(
        eq(
          stylistServices.stylistId,
          data.stylistId
        )
      );

  const stylistServiceIds =
    stylistLinks.map(
      (link) => link.serviceId
    );

  const cannotPerform =
    uniqueServiceIds.find(
      (serviceId) =>
        !stylistServiceIds.includes(
          serviceId
        )
    );

  if (cannotPerform) {
    const service =
      selectedServices.find(
        (item) =>
          item.id ===
          cannotPerform
      );

    return {
      ok: false,
      error: `${
        service?.name ??
        "One selected service"
      } is not assigned to this stylist.`,
    };
  }

  /**
   * Load all variations belonging to
   * the selected services.
   *
   * IMPORTANT:
   * We cannot use service.variations because
   * the Drizzle services query does not include
   * a relations property called "variations".
   */
  const allServiceVariations =
    await db
      .select()
      .from(serviceVariations)
      .where(
        inArray(
          serviceVariations.serviceId,
          uniqueServiceIds
        )
      );

  /**
   * Load specifically selected variation IDs.
   */
  const variationIds =
    data.services
      .map(
        (service) =>
          service.variationId
      )
      .filter(
        (
          id
        ): id is string =>
          Boolean(id)
      );

  const variations =
    variationIds.length > 0
      ? allServiceVariations.filter(
          (variation) =>
            variationIds.includes(
              variation.id
            )
        )
      : [];

  /**
   * Every supplied variation must exist.
   */
  if (
    variations.length !==
    variationIds.length
  ) {
    return {
      ok: false,
      error:
        "One or more selected service options are no longer available.",
    };
  }

  /**
   * Build appointment services.
   */
  const appointmentServiceRecords =
    data.services.map(
      (selected, index) => {
        const service =
          selectedServices.find(
            (item) =>
              item.id ===
              selected.serviceId
          );

        if (!service) {
          throw new Error(
            "Selected service could not be found."
          );
        }

        const variation =
          selected.variationId
            ? variations.find(
                (item) =>
                  item.id ===
                  selected.variationId
              ) ?? null
            : null;

        /**
         * Make sure the variation belongs
         * to this service.
         */
        if (
          variation &&
          variation.serviceId !==
            service.id
        ) {
          throw new Error(
            `Variation does not belong to service ${service.name}.`
          );
        }

        /**
         * FIX:
         * Instead of service.variations.length,
         * check allServiceVariations.
         */
        const serviceHasVariations =
          allServiceVariations.some(
            (item) =>
              item.serviceId ===
              service.id
          );

        if (
          serviceHasVariations &&
          !variation
        ) {
          throw new Error(
            `Please choose an option for ${service.name}.`
          );
        }

        const price =
          variation?.price ??
          service.priceMin;

        return {
          service,
          variation,
          price,
          durationMinutes:
            service.durationMinutes,
          sortOrder: index,
        };
      }
    );

  const totalDuration =
    appointmentServiceRecords.reduce(
      (total, item) =>
        total +
        item.durationMinutes,
      0
    );

  const totalPrice =
    appointmentServiceRecords.reduce(
      (total, item) =>
        total + item.price,
      0
    );

  if (totalDuration <= 0) {
    return {
      ok: false,
      error:
        "The selected services have an invalid duration.",
    };
  }

  /**
   * Verify requested time is still available.
   */
  const availableSlots =
    await getAvailableSlots({
      stylistId:
        data.stylistId,

      serviceIds:
        uniqueServiceIds,

      date:
        data.date,
    });

  if (
    !availableSlots.includes(
      data.time
    )
  ) {
    return {
      ok: false,
      error:
        "This time is no longer available. Please choose another time.",
    };
  }

  const session =
    await getSession();

  /**
   * Final conflict check immediately
   * before creating the appointment.
   */
  const [settings] =
    await db
      .select()
      .from(salonSettings)
      .where(
        eq(
          salonSettings.id,
          "main"
        )
      );

  const bookingBuffer =
    settings?.bookingBufferMinutes ??
    15;

  const requestedStart =
    timeToMinutes(
      data.time
    );

  const requestedEnd =
    requestedStart +
    totalDuration +
    bookingBuffer;

  const existingAppointments =
    await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(
            appointments.stylistId,
            data.stylistId
          ),
          eq(
            appointments.scheduledDate,
            data.date
          ),
          inArray(
            appointments.status,
            [...ACTIVE_STATUSES]
          )
        )
      );

  const hasConflict =
    existingAppointments.some(
      (appointment) => {
        const existingStart =
          timeToMinutes(
            appointment.scheduledTime
          );

        const existingEnd =
          existingStart +
          appointment.durationMinutes +
          bookingBuffer;

        return (
          requestedStart <
            existingEnd &&
          requestedEnd >
            existingStart
        );
      }
    );

  if (hasConflict) {
    return {
      ok: false,
      error:
        "This time was just booked by another customer. Please choose another time.",
    };
  }

  const primaryService =
    appointmentServiceRecords[0];

  /**
   * Create appointment.
   */
  const [appointment] =
    await db
      .insert(appointments)
      .values({
        customerId:
          session?.role ===
          "customer"
            ? session.userId
            : null,

        customerName:
          data.customerName,

        customerPhone:
          data.customerPhone,

        serviceId:
          primaryService.service.id,

        variationId:
          primaryService.variation
            ?.id ?? null,

        stylistId:
          data.stylistId,

        scheduledDate:
          data.date,

        scheduledTime:
          data.time,

        durationMinutes:
          totalDuration,

        priceEstimate:
          totalPrice,

        instructions:
          data.instructions ||
          null,

        source:
          "online",

        status:
          "confirmed",
      })
      .returning();

  if (!appointment) {
    return {
      ok: false,
      error:
        "Unable to create the appointment.",
    };
  }

  /**
   * Store every selected service.
   */
  await db
    .insert(appointmentServices)
    .values(
      appointmentServiceRecords.map(
        (item) => ({
          appointmentId:
            appointment.id,

          serviceId:
            item.service.id,

          variationId:
            item.variation?.id ??
            null,

          price:
            item.price,

          durationMinutes:
            item.durationMinutes,

          sortOrder:
            item.sortOrder,
        })
      )
    );

  /**
   * Status history.
   */
  await db
    .insert(
      appointmentStatusHistory
    )
    .values({
      appointmentId:
        appointment.id,

      status:
        "confirmed",

      changedByUserId:
        session?.userId ??
        null,

      changedByRole:
        session?.role ??
        "customer",

      note: `Booking created online with ${appointmentServiceRecords.length} service(s).`,
    });

  /**
   * Customer references.
   */
  if (
    data.referenceUrls &&
    data.referenceUrls.length > 0
  ) {
    await db
      .insert(customerReferences)
      .values(
        data.referenceUrls.map(
          (url) => ({
            appointmentId:
              appointment.id,

            url,

            type:
              /\.(mp4|mov|webm|m4v)$/i.test(
                url
              )
                ? ("video" as const)
                : ("image" as const),
          })
        )
      );
  }

  /**
   * Audit.
   */
  await recordAudit({
    session,

    action:
      "appointment_created",

    entityType:
      "appointment",

    entityId:
      appointment.id,

    after: {
      status:
        "confirmed",

      stylistId:
        data.stylistId,

      date:
        data.date,

      time:
        data.time,

      services:
        appointmentServiceRecords.map(
          (item) => ({
            serviceId:
              item.service.id,

            serviceName:
              item.service.name,

            variationId:
              item.variation?.id ??
              null,

            price:
              item.price,

            durationMinutes:
              item.durationMinutes,
          })
        ),

      totalPrice,

      totalDuration,
    },
  });

  /**
   * Notifications.
   */
  const serviceNames =
    appointmentServiceRecords
      .map(
        (item) =>
          item.service.name
      )
      .join(", ");

  await notify({
    userId:
      data.stylistId,

    type:
      "new_appointment",

    title:
      "New appointment booked",

    body: `${data.customerName} booked ${serviceNames} on ${data.date} at ${data.time}.`,

    relatedAppointmentId:
      appointment.id,
  });

  const admins =
    await db
      .select()
      .from(users)
      .where(
        inArray(users.role, [
          "manager",
          "owner",
        ])
      );

  await Promise.all(
    admins.map((admin) =>
      notify({
        userId:
          admin.id,

        type:
          "new_booking",

        title:
          "New booking",

        body: `${data.customerName} booked ${serviceNames} with a stylist on ${data.date} at ${data.time}.`,

        relatedAppointmentId:
          appointment.id,
      })
    )
  );

  revalidatePath(
    "/account"
  );

  revalidatePath(
    "/stylist"
  );

  revalidatePath(
    "/admin"
  );

  return {
    ok: true,
    appointmentId:
      appointment.id,
  };
}

/**
 * Walk-in / QR booking.
 *
 * Walk-ins remain single-service for now.
 */
const walkinSchema =
  z.object({
    serviceId:
      z.string().min(1),

    variationId:
      z
        .string()
        .min(1)
        .optional(),

    stylistId:
      z
        .string()
        .min(1)
        .optional(),

    customerName:
      z
        .string()
        .trim()
        .min(
          2,
          "Please enter your name."
        ),

    customerPhone:
      z
        .string()
        .trim()
        .min(
          9,
          "Please enter a valid phone number."
        ),

    instructions:
      z.string().optional(),

    source:
      z
        .enum([
          "walk_in",
          "qr",
        ])
        .default("qr"),
  });

export async function createWalkIn(
  input: z.infer<
    typeof walkinSchema
  >
): Promise<BookingResult> {
  const parsed =
    walkinSchema.safeParse(
      input
    );

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]
          ?.message ??
        "Invalid walk-in information.",
    };
  }

  const data = parsed.data;

  const [service] =
    await db
      .select()
      .from(services)
      .where(
        eq(
          services.id,
          data.serviceId
        )
      );

  if (
    !service ||
    !service.active
  ) {
    return {
      ok: false,
      error:
        "This service is no longer available.",
    };
  }

  /**
   * Load variations for this service.
   *
   * FIX:
   * Do not use service.variations.
   */
  const serviceVariationsList =
    await db
      .select()
      .from(serviceVariations)
      .where(
        eq(
          serviceVariations.serviceId,
          service.id
        )
      );

  let price =
    service.priceMin;

  let selectedVariationId:
    | string
    | null = null;

  if (data.variationId) {
    const variation =
      serviceVariationsList.find(
        (item) =>
          item.id ===
          data.variationId
      );

    if (!variation) {
      return {
        ok: false,
        error:
          "The selected service option could not be found.",
      };
    }

    selectedVariationId =
      variation.id;

    price =
      variation.price;
  }

  /**
   * FIX:
   * Check the separately loaded variations.
   */
  if (
    serviceVariationsList.length >
      0 &&
    !selectedVariationId
  ) {
    return {
      ok: false,
      error:
        "Please choose a service option.",
    };
  }

  /**
   * Verify stylist assignment.
   */
  if (data.stylistId) {
    const [stylistLink] =
      await db
        .select()
        .from(
          stylistServices
        )
        .where(
          and(
            eq(
              stylistServices.stylistId,
              data.stylistId
            ),
            eq(
              stylistServices.serviceId,
              data.serviceId
            )
          )
        );

    if (!stylistLink) {
      return {
        ok: false,
        error:
          "This stylist is not assigned to the selected service.",
      };
    }
  }

  const now = new Date();

  const session =
    await getSession();

  const scheduledDate =
    getGhanaDate();

  const currentGhanaMinutes =
    getGhanaMinutes();

  const scheduledTime =
    `${Math.floor(
      currentGhanaMinutes / 60
    )
      .toString()
      .padStart(2, "0")}:${(
      currentGhanaMinutes % 60
    )
      .toString()
      .padStart(2, "0")}`;

  /**
   * Create appointment.
   */
  const [appointment] =
    await db
      .insert(appointments)
      .values({
        customerId:
          session?.role ===
          "customer"
            ? session.userId
            : null,

        customerName:
          data.customerName,

        customerPhone:
          data.customerPhone,

        serviceId:
          data.serviceId,

        variationId:
          selectedVariationId,

        stylistId:
          data.stylistId ?? null,

        scheduledDate,

        scheduledTime,

        durationMinutes:
          service.durationMinutes,

        priceEstimate:
          price,

        instructions:
          data.instructions ||
          null,

        source:
          data.source,

        status:
          "arrived",

        customerArrivedAt:
          now.toISOString(),

        arrivalLocationVerified:
          false,
      })
      .returning();

  if (!appointment) {
    return {
      ok: false,
      error:
        "Unable to create the walk-in appointment.",
    };
  }

  /**
   * Store walk-in service.
   */
  await db
    .insert(appointmentServices)
    .values({
      appointmentId:
        appointment.id,

      serviceId:
        data.serviceId,

      variationId:
        selectedVariationId,

      price,

      durationMinutes:
        service.durationMinutes,

      sortOrder: 0,
    });

  /**
   * Status history.
   */
  await db
    .insert(
      appointmentStatusHistory
    )
    .values({
      appointmentId:
        appointment.id,

      status:
        "arrived",

      changedByUserId:
        session?.userId ??
        null,

      changedByRole:
        session?.role ??
        "customer",

      note:
        data.source === "qr"
          ? "Joined via QR walk-in."
          : "Created by reception as walk-in.",
    });

  /**
   * Queue position.
   */
  const existingQueue =
    await db
      .select()
      .from(queueEntries);

  const position =
    existingQueue.filter(
      (entry) =>
        entry.status ===
        "waiting"
    ).length + 1;

  await db
    .insert(queueEntries)
    .values({
      appointmentId:
        appointment.id,

      position,

      status:
        "waiting",
    });

  /**
   * Notify admins.
   */
  const admins =
    await db
      .select()
      .from(users)
      .where(
        inArray(users.role, [
          "manager",
          "owner",
        ])
      );

  await Promise.all(
    admins.map((admin) =>
      notify({
        userId:
          admin.id,

        type:
          "walk_in",

        title:
          "New walk-in",

        body: `${data.customerName} joined the queue for ${service.name}.`,

        relatedAppointmentId:
          appointment.id,
      })
    )
  );

  revalidatePath(
    "/admin"
  );

  revalidatePath(
    "/admin/queue"
  );

  return {
    ok: true,
    appointmentId:
      appointment.id,
  };
}

/**
 * Customer arrival / check-in.
 */
export async function markCustomerArrived(
  params: {
    appointmentId: string;
    lat?: number;
    lng?: number;
  }
) {
  const session =
    await getSession();

  const [appt] =
    await db
      .select()
      .from(appointments)
      .where(
        eq(
          appointments.id,
          params.appointmentId
        )
      );

  if (!appt) {
    return {
      ok: false as const,
      error:
        "Appointment not found.",
    };
  }

  if (appt.customerArrivedAt) {
    return {
      ok: false as const,
      error:
        "Arrival already recorded.",
    };
  }

  const [settings] =
    await db
      .select()
      .from(salonSettings)
      .where(
        eq(
          salonSettings.id,
          "main"
        )
      );

  let verified:
    | boolean
    | null = null;

  if (
    params.lat != null &&
    params.lng != null &&
    settings?.latitude != null &&
    settings?.longitude != null
  ) {
    const {
      distanceMeters,
    } = await import(
      "@/lib/geo"
    );

    const distance =
      distanceMeters(
        params.lat,
        params.lng,
        settings.latitude,
        settings.longitude
      );

    verified =
      distance <=
      (settings.checkInRadiusMeters ??
        100);
  } else {
    verified = false;
  }

  const now =
    new Date().toISOString();

  await db
    .update(appointments)
    .set({
      customerArrivedAt:
        now,

      arrivalLocationVerified:
        verified,

      status:
        "arrived",
    })
    .where(
      eq(
        appointments.id,
        params.appointmentId
      )
    );

  await db
    .insert(
      appointmentStatusHistory
    )
    .values({
      appointmentId:
        params.appointmentId,

      status:
        "arrived",

      changedByUserId:
        session?.userId ??
        null,

      changedByRole:
        session?.role ??
        "customer",

      note: verified
        ? "Customer self check-in (location verified)."
        : "Customer self check-in (location not verified).",
    });

  /**
   * Notify stylist.
   */
  if (appt.stylistId) {
    await notify({
      userId:
        appt.stylistId,

      type:
        "customer_arrived",

      title:
        "Customer has arrived",

      body: `${appt.customerName} has arrived for their ${appt.scheduledTime} appointment.`,

      relatedAppointmentId:
        appt.id,
    });
  }

  /**
   * Notify admins.
   */
  const admins =
    await db
      .select()
      .from(users)
      .where(
        inArray(users.role, [
          "manager",
          "owner",
        ])
      );

  await Promise.all(
    admins.map((admin) =>
      notify({
        userId:
          admin.id,

        type:
          "customer_arrived",

        title:
          "Customer arrived",

        body: `${appt.customerName} has arrived.`,

        relatedAppointmentId:
          appt.id,
      })
    )
  );

  revalidatePath(
    `/account/appointments/${params.appointmentId}`
  );

  revalidatePath(
    "/stylist"
  );

  revalidatePath(
    "/admin"
  );

  return {
    ok: true as const,
    verified,
  };
}

/**
 * Cancellation.
 */
const cancelReasons = [
  "changed_plans",
  "emergency",
  "schedule_conflict",
  "service_issue",
  "other",
] as const;

const cancelSchema =
  z.object({
    appointmentId:
      z.string().min(1),

    reason:
      z.enum(cancelReasons),

    note:
      z.string().optional(),
  });

export async function cancelAppointment(
  input: z.infer<
    typeof cancelSchema
  >
) {
  const parsed =
    cancelSchema.safeParse(
      input
    );

  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]
          ?.message ??
        "Invalid cancellation request.",
    };
  }

  const data =
    parsed.data;

  const session =
    await getSession();

  const [appt] =
    await db
      .select()
      .from(appointments)
      .where(
        eq(
          appointments.id,
          data.appointmentId
        )
      );

  if (!appt) {
    return {
      ok: false as const,
      error:
        "Appointment not found.",
    };
  }

  if (
    [
      "completed",
      "cancelled",
      "no_show",
    ].includes(appt.status)
  ) {
    return {
      ok: false as const,
      error:
        "This appointment can no longer be cancelled.",
    };
  }

  await db
    .update(appointments)
    .set({
      status:
        "cancelled",
    })
    .where(
      eq(
        appointments.id,
        data.appointmentId
      )
    );

  await db
    .insert(
      appointmentStatusHistory
    )
    .values({
      appointmentId:
        data.appointmentId,

      status:
        "cancelled",

      changedByUserId:
        session?.userId ??
        null,

      changedByRole:
        session?.role ??
        "customer",

      note:
        data.note,
    });

  await db
    .insert(cancellations)
    .values({
      appointmentId:
        data.appointmentId,

      cancelledByUserId:
        session?.userId ??
        null,

      cancelledByRole:
        session?.role ??
        "customer",

      reason:
        data.reason,

      note:
        data.note ||
        null,
    });

  const recipients =
    appt.stylistId
      ? [appt.stylistId]
      : [];

  const admins =
    await db
      .select()
      .from(users)
      .where(
        inArray(users.role, [
          "manager",
          "owner",
        ])
      );

  recipients.push(
    ...admins.map(
      (admin) => admin.id
    )
  );

  await Promise.all(
    recipients.map(
      (userId) =>
        notify({
          userId,

          type:
            "cancellation",

          title:
            "Appointment cancelled",

          body: `${appt.customerName}'s appointment on ${appt.scheduledDate} at ${appt.scheduledTime} was cancelled.`,

          relatedAppointmentId:
            appt.id,
        })
    )
  );

  if (appt.customerId) {
    await notify({
      userId:
        appt.customerId,

      type:
        "cancellation_confirmation",

      title:
        "Cancellation confirmed",

      body: `Your appointment on ${appt.scheduledDate} at ${appt.scheduledTime} has been cancelled.`,

      relatedAppointmentId:
        appt.id,
    });
  }

  await recordAudit({
    session,

    action:
      "appointment_cancelled",

    entityType:
      "appointment",

    entityId:
      data.appointmentId,

    before: {
      status:
        appt.status,
    },

    after: {
      status:
        "cancelled",

      reason:
        data.reason,
    },
  });

  revalidatePath(
    "/account"
  );

  revalidatePath(
    "/stylist"
  );

  revalidatePath(
    "/admin"
  );

  return {
    ok: true as const,
  };
}

/**
 * Mark appointment as no-show.
 */
export async function markNoShow(
  appointmentId: string
) {
  const session =
    await requireRole(
      "stylist",
      "manager",
      "owner"
    );

  const [appt] =
    await db
      .select()
      .from(appointments)
      .where(
        eq(
          appointments.id,
          appointmentId
        )
      );

  if (!appt) {
    return {
      ok: false as const,
      error:
        "Appointment not found.",
    };
  }

  if (
    [
      "completed",
      "cancelled",
      "no_show",
    ].includes(appt.status)
  ) {
    return {
      ok: false as const,
      error:
        "This appointment cannot be marked as no-show.",
    };
  }

  await db
    .update(appointments)
    .set({
      status:
        "no_show",
    })
    .where(
      eq(
        appointments.id,
        appointmentId
      )
    );

  await db
    .insert(
      appointmentStatusHistory
    )
    .values({
      appointmentId,

      status:
        "no_show",

      changedByUserId:
        session.userId,

      changedByRole:
        session.role,
    });

  await recordAudit({
    session,

    action:
      "appointment_marked_no_show",

    entityType:
      "appointment",

    entityId:
      appointmentId,

    before: {
      status:
        appt.status,
    },

    after: {
      status:
        "no_show",
    },
  });

  revalidatePath(
    "/admin"
  );

  revalidatePath(
    "/stylist"
  );

  return {
    ok: true as const,
  };
}