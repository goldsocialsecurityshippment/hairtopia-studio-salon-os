"use server";

import { db } from "@/db";
import { queueEntries, appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function callNextInQueue(queueEntryId: string, stylistId: string) {
  const session = await requireRole("manager", "owner");
  const [entry] = await db.select().from(queueEntries).where(eq(queueEntries.id, queueEntryId));
  if (!entry) return { ok: false as const, error: "Queue entry not found." };

  await db.update(queueEntries).set({ status: "called" }).where(eq(queueEntries.id, queueEntryId));
  await db
    .update(appointments)
    .set({ stylistId, status: "confirmed" })
    .where(eq(appointments.id, entry.appointmentId));

  await recordAudit({
    session,
    action: "queue_customer_called",
    entityType: "queue_entry",
    entityId: queueEntryId,
    after: { stylistId },
  });

  revalidatePath("/admin/queue");
  return { ok: true as const };
}

export async function updateQueueStatus(
  queueEntryId: string,
  status: "waiting" | "called" | "in_service" | "completed" | "cancelled" | "no_show"
) {
  const session = await requireRole("manager", "owner");
  await db.update(queueEntries).set({ status }).where(eq(queueEntries.id, queueEntryId));
  await recordAudit({
    session,
    action: "queue_status_updated",
    entityType: "queue_entry",
    entityId: queueEntryId,
    after: { status },
  });
  revalidatePath("/admin/queue");
  return { ok: true as const };
}
