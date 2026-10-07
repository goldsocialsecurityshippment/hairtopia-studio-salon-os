import { db } from "@/db";
import { clients, appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Normalizes a Ghanaian (or generic) phone number so the same person is
 * matched whether they typed "0244 123 456", "+233244123456", "233244123456"
 * or "024-412-3456". This is the single normalization function used by
 * every write path (online booking, walk-in, registration) so client
 * matching is consistent and duplicate-free.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+/, "");
  // Ghana: local numbers are 0XXXXXXXXX (10 digits). Country code is 233.
  if (digits.startsWith("233") && digits.length === 12) {
    return "+" + digits;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return "+233" + digits.slice(1);
  }
  if (digits.length === 9) {
    // missing leading 0, assume local
    return "+233" + digits;
  }
  // Fallback: return with a leading + if it looks international already,
  // otherwise return the cleaned digits as-is so we never silently drop data.
  return digits.length > 0 ? (raw.trim().startsWith("+") ? "+" + digits : digits) : raw.trim();
}

export type ClientIntake = {
  fullName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  linkedUserId?: string | null;
};

/**
 * Finds an existing client by normalized phone, or creates a new one.
 * This is THE single entry point for both online-booking and walk-in flows
 * so a person is never double-counted as two "unique clients". Never
 * creates a duplicate: phone has a unique DB constraint as a second line
 * of defense against races.
 */
export async function findOrCreateClient(intake: ClientIntake) {
  const phone = normalizePhone(intake.phone);

  const [existing] = await db.select().from(clients).where(eq(clients.phone, phone));
  if (existing) {
    // Backfill a linked user id / refresh name if the client now has an account,
    // but never overwrite existing hair-intake or notes data.
    if (intake.linkedUserId && !existing.linkedUserId) {
      await db
        .update(clients)
        .set({ linkedUserId: intake.linkedUserId, updatedAt: new Date().toISOString() })
        .where(eq(clients.id, existing.id));
    }
    return { client: existing, created: false as const };
  }

  try {
    const [created] = await db
      .insert(clients)
      .values({
        fullName: intake.fullName,
        phone,
        whatsapp: intake.whatsapp || null,
        email: intake.email || null,
        linkedUserId: intake.linkedUserId || null,
      })
      .returning();
    return { client: created, created: true as const };
  } catch {
    // Unique constraint race: someone else created this phone number
    // microseconds ago. Fetch and use that row instead of erroring out.
    const [race] = await db.select().from(clients).where(eq(clients.phone, phone));
    if (race) return { client: race, created: false as const };
    throw new Error("Could not create or match client record.");
  }
}

/**
 * Server-side privacy gate for a single client record. This is the ONLY
 * function UI/actions should trust for "can this session see this client's
 * private data" — it is not a UI hint, callers must actually branch on it.
 *
 * - owner / admin (trusted admin): full access
 * - manager: operational access (no deep hair/medical notes)
 * - stylist: only clients they are currently or have been assigned to serve
 * - customer: only their own linked client record
 */
export async function assertClientAccess(
  session: SessionPayload | null,
  clientId: string
): Promise<{ allowed: boolean; scope: "full" | "operational" | "assigned" | "self" | "none" }> {
  if (!session) return { allowed: false, scope: "none" };

  if (session.role === "owner" || session.role === "admin") {
    return { allowed: true, scope: "full" };
  }

  if (session.role === "manager") {
    return { allowed: true, scope: "operational" };
  }

  if (session.role === "customer") {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (client?.linkedUserId === session.userId) return { allowed: true, scope: "self" };
    return { allowed: false, scope: "none" };
  }

  if (session.role === "stylist") {
    // A stylist may see a client's record only if they have at least one
    // appointment (past or upcoming) assigned to them for that client.
    const clientAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.clientId, clientId));
    const isAssigned = clientAppointments.some((a) => a.stylistId === session.userId);
    return isAssigned ? { allowed: true, scope: "assigned" } : { allowed: false, scope: "none" };
  }

  return { allowed: false, scope: "none" };
}

/** Fields considered sensitive/clinical — stripped out for "operational" and
 * "assigned" scopes so a stylist or manager doing day-to-day work never sees
 * more than they need (allergies/reactions/products ARE shown to the
 * assigned stylist since they're needed to perform the service safely). */
export function redactClientForScope<T extends Record<string, unknown>>(
  client: T,
  scope: "full" | "operational" | "assigned" | "self" | "none"
): Partial<T> {
  if (scope === "full" || scope === "self") return client;
  if (scope === "none") return {};

  const rest: Record<string, unknown> = { ...client };
  const previousReactions = rest.previousReactions;
  delete rest.notes;

  if (scope === "assigned") {
    // Stylist performing the service needs allergy/product/hair info, but not
    // free-text front-of-house notes about the client.
    return { ...(rest as T), previousReactions } as Partial<T>;
  }
  // "operational" (manager): drop private notes entirely.
  return rest as Partial<T>;
}
