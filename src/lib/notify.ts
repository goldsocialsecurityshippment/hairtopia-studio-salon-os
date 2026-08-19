import { db } from "@/db";
import { notifications } from "@/db/schema";

/**
 * Creates an in-app notification. Structured so an SMS/email/WhatsApp
 * provider can be plugged in here later without changing call sites.
 */
export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedAppointmentId?: string;
}) {
  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    relatedAppointmentId: params.relatedAppointmentId ?? null,
  });
}
