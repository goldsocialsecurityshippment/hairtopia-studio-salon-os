"use server";

import { db } from "@/db";
import { pushSubscriptions, users, notificationPreferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import webpush from "web-push";

/** Maps every notification `type` string used across the app to one of the
 * broad preference categories a user can toggle. Unrecognized/new types
 * default to "systemEvents" so a future event is never silently dropped
 * because someone forgot to add it here — it just falls into the general
 * bucket until explicitly categorized. */
const TYPE_TO_CATEGORY: Record<string, keyof typeof DEFAULT_PREFS> = {
  new_appointment: "bookingEvents",
  new_booking: "bookingEvents",
  appointment_changed: "bookingEvents",
  appointment_reminder: "reminderEvents",
  deposit_reminder: "reminderEvents",
  payment_received: "paymentEvents",
  payment_failed: "paymentEvents",
  consultation_requested: "consultationEvents",
  consultation_update: "consultationEvents",
  consultation_assigned: "consultationEvents",
  cancellation: "cancellationEvents",
  cancellation_confirmation: "cancellationEvents",
  cancellation_request: "cancellationEvents",
  cancellation_request_resolved: "cancellationEvents",
  reschedule_requested: "cancellationEvents",
  reschedule_approved: "cancellationEvents",
  reschedule_declined: "cancellationEvents",
  staff_warning: "staffEvents",
  contract_added: "staffEvents",
  staff_rule_published: "staffEvents",
  staff_no_show: "staffEvents",
  check_in: "queueEvents",
  check_out: "queueEvents",
  customer_arrived: "queueEvents",
  walk_in: "queueEvents",
  service_awaiting_verification: "queueEvents",
  service_completed: "queueEvents",
  manual_correction: "queueEvents",
  low_inventory: "systemEvents",
  login: "systemEvents",
};

const DEFAULT_PREFS = {
  bookingEvents: true,
  reminderEvents: true,
  paymentEvents: true,
  consultationEvents: true,
  cancellationEvents: true,
  staffEvents: true,
  queueEvents: true,
  systemEvents: true,
};

function categoryFor(type: string): keyof typeof DEFAULT_PREFS {
  return TYPE_TO_CATEGORY[type] ?? "systemEvents";
}

export async function getNotificationPreferences(userId: string) {
  const session = await getSession();
  const isSelf = session?.userId === userId;
  const isStaff = session && ["owner", "admin", "manager"].includes(session.role);
  // Never leak another user's preference choices to an arbitrary caller —
  // only the user themselves, or back-office staff, may read them. An
  // unauthorized request gets safe defaults back, not an error that would
  // confirm whether the userId even exists.
  if (!isSelf && !isStaff) return { userId, ...DEFAULT_PREFS };

  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return row ?? { userId, ...DEFAULT_PREFS };
}

const prefsSchema = z.object({
  bookingEvents: z.boolean(),
  reminderEvents: z.boolean(),
  paymentEvents: z.boolean(),
  consultationEvents: z.boolean(),
  cancellationEvents: z.boolean(),
  staffEvents: z.boolean(),
  queueEvents: z.boolean(),
  systemEvents: z.boolean(),
});

export async function updateNotificationPreferences(input: z.infer<typeof prefsSchema>) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid preferences." };

  const [existing] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, session.userId));
  if (existing) {
    await db.update(notificationPreferences).set(parsed.data).where(eq(notificationPreferences.userId, session.userId));
  } else {
    await db.insert(notificationPreferences).values({ userId: session.userId, ...parsed.data });
  }
  return { ok: true as const };
}

function vapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@hairtopiastudio.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return true;
}

/** Exposed to the client so it can call `PushManager.subscribe({ applicationServerKey })`
 * without the private key ever leaving the server. */
export async function getVapidPublicKey() {
  return vapidConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().optional(),
});

/** Registers (or refreshes) a push subscription for the current session's
 * user. Endpoint is unique — re-subscribing the same device updates the
 * existing row rather than creating a duplicate. */
export async function subscribeToPush(input: z.infer<typeof subscribeSchema>) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "You must be signed in to enable notifications." };

  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(`push-sub:${session.userId}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) return { ok: false as const, error: "Too many subscription attempts. Please wait a moment." };

  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid subscription." };

  const [existing] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: session.userId,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent ?? existing.userAgent,
        active: true,
        lastActiveAt: new Date().toISOString(),
      })
      .where(eq(pushSubscriptions.id, existing.id));
  } else {
    await db.insert(pushSubscriptions).values({
      userId: session.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      lastActiveAt: new Date().toISOString(),
    });
  }

  return { ok: true as const };
}

export async function unsubscribeFromPush(endpoint: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  // Only the owning user (or staff, for support/cleanup) may deactivate a
  // subscription — otherwise anyone who obtained an endpoint string could
  // silently turn off someone else's notifications.
  const [sub] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  if (!sub) return { ok: true as const }; // already gone — no-op, not an error
  const isStaff = ["owner", "admin", "manager"].includes(session.role);
  if (sub.userId !== session.userId && !isStaff) {
    return { ok: false as const, error: "Not authorized." };
  }
  await db.update(pushSubscriptions).set({ active: false }).where(eq(pushSubscriptions.endpoint, endpoint));
  return { ok: true as const };
}

export async function setPushPreference(enabled: boolean) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  await db.update(users).set({ pushEnabled: enabled }).where(eq(users.id, session.userId));
  return { ok: true as const };
}

/**
 * Sends a push notification to every active subscription/device belonging
 * to a user. Best-effort: failures for one device never block others, and
 * a subscription the push service reports as gone (404/410) is
 * automatically deactivated — this is what "invalid subscription cleanup"
 * means in practice, not a manual admin chore.
 *
 * Silently does nothing if VAPID isn't configured or the user has push
 * notifications turned off — this is intentional graceful degradation, not
 * a hidden failure: the in-app notification (via `notify()`) still lands
 * either way.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; type?: string }
) {
  if (!configureWebPush()) return { sent: 0, skipped: "not_configured" as const };

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.pushEnabled) return { sent: 0, skipped: "user_disabled" as const };

  // Per-category preference check — the master switch above already
  // passed; now check the specific category this event belongs to.
  if (payload.type) {
    const prefs = await getNotificationPreferences(userId);
    const category = categoryFor(payload.type);
    if (!prefs[category]) return { sent: 0, skipped: "category_disabled" as const };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.active, true)));

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/" })
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (browser unsubscribed, device reset, etc.) — deactivate it.
          await db.update(pushSubscriptions).set({ active: false }).where(eq(pushSubscriptions.id, sub.id));
        }
        // Other errors (network blips, etc.) are swallowed here — push is
        // best-effort and must never break the calling action.
      }
    })
  );

  return { sent, skipped: null };
}
