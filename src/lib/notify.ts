import { db } from "@/db";
import { notifications } from "@/db/schema";

/**
 * Creates an in-app notification AND, best-effort, a Web Push notification
 * (real PWA push — not SMS/WhatsApp) to every device the user has
 * subscribed. Push failures never block the in-app notification or the
 * calling action; see sendPushToUser for the graceful-degradation rules.
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

  try {
    const { sendPushToUser } = await import("@/lib/actions/push");
    await sendPushToUser(params.userId, { title: params.title, body: params.body, type: params.type });
  } catch {
    // Push is best-effort — the in-app notification above already landed.
  }
}
