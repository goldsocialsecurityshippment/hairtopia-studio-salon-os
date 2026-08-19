import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { SessionPayload } from "@/lib/auth/session";

export async function recordAudit(params: {
  session: SessionPayload | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(auditLogs).values({
    userId: params.session?.userId ?? null,
    userRole: params.session?.role ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    beforeValue: params.before !== undefined ? JSON.stringify(params.before) : null,
    afterValue: params.after !== undefined ? JSON.stringify(params.after) : null,
  });
}
