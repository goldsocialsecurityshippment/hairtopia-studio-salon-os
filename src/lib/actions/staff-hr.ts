"use server";

import { db } from "@/db";
import {
  staffContracts,
  staffWarnings,
  staffNoShows,
  staffAdvances,
  uniformIssues,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { notify } from "@/lib/notify";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const HR_ROLES = ["owner", "admin", "manager"] as const;

/** ---------------- CONTRACTS ---------------- */
const contractSchema = z.object({
  staffId: z.string(),
  title: z.string().min(1),
  contractType: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  terms: z.string().optional(),
  documentUrl: z.string().optional(),
});

export async function addStaffContract(input: z.infer<typeof contractSchema>) {
  const session = await requireRole(...HR_ROLES);
  const parsed = contractSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [created] = await db
    .insert(staffContracts)
    .values({ ...parsed.data, endDate: parsed.data.endDate || null, terms: parsed.data.terms || null, documentUrl: parsed.data.documentUrl || null, createdByUserId: session.userId })
    .returning();

  await recordAudit({ session, action: "staff_contract_created", entityType: "staff_contract", entityId: created.id, after: parsed.data });
  await notify({
    userId: parsed.data.staffId,
    type: "contract_added",
    title: "New contract on file",
    body: `A new contract ("${parsed.data.title}") has been added to your record.`,
  });

  revalidatePath(`/admin/staff/${parsed.data.staffId}`);
  return { ok: true as const };
}

export async function setContractStatus(contractId: string, status: "active" | "ended" | "terminated") {
  const session = await requireRole(...HR_ROLES);
  const [before] = await db.select().from(staffContracts).where(eq(staffContracts.id, contractId));
  if (!before) return { ok: false as const, error: "Contract not found." };

  await db.update(staffContracts).set({ status }).where(eq(staffContracts.id, contractId));
  await recordAudit({ session, action: "staff_contract_status_changed", entityType: "staff_contract", entityId: contractId, before: { status: before.status }, after: { status } });
  revalidatePath(`/admin/staff/${before.staffId}`);
  return { ok: true as const };
}

export async function acknowledgeContract(contractId: string) {
  const session = await requireRole("stylist", "manager", "owner", "admin");
  const [contract] = await db.select().from(staffContracts).where(eq(staffContracts.id, contractId));
  if (!contract) return { ok: false as const, error: "Contract not found." };
  if (contract.staffId !== session.userId) return { ok: false as const, error: "You can only acknowledge your own contract." };

  await db.update(staffContracts).set({ acknowledgedAt: new Date().toISOString() }).where(eq(staffContracts.id, contractId));
  await recordAudit({ session, action: "staff_contract_acknowledged", entityType: "staff_contract", entityId: contractId });
  revalidatePath("/stylist/rules");
  return { ok: true as const };
}

export async function listStaffContracts(staffId: string) {
  await requireRole(...HR_ROLES, "stylist");
  return db.select().from(staffContracts).where(eq(staffContracts.staffId, staffId)).orderBy(desc(staffContracts.createdAt));
}

/** ---------------- WARNINGS ---------------- */
const warningSchema = z.object({
  staffId: z.string(),
  level: z.enum(["verbal", "written", "final", "termination"]),
  reason: z.string().min(1),
  details: z.string().optional(),
  evidenceUrl: z.string().optional(),
});

export async function issueStaffWarning(input: z.infer<typeof warningSchema>) {
  const session = await requireRole(...HR_ROLES);
  const parsed = warningSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [created] = await db
    .insert(staffWarnings)
    .values({ ...parsed.data, details: parsed.data.details || null, evidenceUrl: parsed.data.evidenceUrl || null, issuedByUserId: session.userId })
    .returning();

  await recordAudit({ session, action: "staff_warning_issued", entityType: "staff_warning", entityId: created.id, after: { level: parsed.data.level, reason: parsed.data.reason } });
  await notify({
    userId: parsed.data.staffId,
    type: "staff_warning",
    title: `${parsed.data.level[0].toUpperCase()}${parsed.data.level.slice(1)} warning issued`,
    body: parsed.data.reason,
  });

  revalidatePath(`/admin/staff/${parsed.data.staffId}`);
  return { ok: true as const };
}

export async function acknowledgeWarning(warningId: string) {
  const session = await requireRole("stylist", "manager", "owner", "admin");
  const [warning] = await db.select().from(staffWarnings).where(eq(staffWarnings.id, warningId));
  if (!warning) return { ok: false as const, error: "Warning not found." };
  if (warning.staffId !== session.userId) return { ok: false as const, error: "You can only acknowledge your own warning." };

  await db.update(staffWarnings).set({ acknowledgedAt: new Date().toISOString() }).where(eq(staffWarnings.id, warningId));
  await recordAudit({ session, action: "staff_warning_acknowledged", entityType: "staff_warning", entityId: warningId });
  revalidatePath("/stylist/rules");
  return { ok: true as const };
}

export async function listStaffWarnings(staffId: string) {
  await requireRole(...HR_ROLES, "stylist");
  return db.select().from(staffWarnings).where(eq(staffWarnings.staffId, staffId)).orderBy(desc(staffWarnings.issuedAt));
}

/** ---------------- STAFF NO-SHOWS ---------------- */
const noShowSchema = z.object({
  staffId: z.string(),
  scheduledDate: z.string().min(1),
  scheduledStart: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordStaffNoShow(input: z.infer<typeof noShowSchema>) {
  const session = await requireRole(...HR_ROLES);
  const parsed = noShowSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [created] = await db
    .insert(staffNoShows)
    .values({ ...parsed.data, scheduledStart: parsed.data.scheduledStart || null, reason: parsed.data.reason || null, notes: parsed.data.notes || null, recordedByUserId: session.userId })
    .returning();

  await recordAudit({ session, action: "staff_no_show_recorded", entityType: "staff_no_show", entityId: created.id, after: parsed.data });

  // Notify other back-office staff (not the recorder themselves, and never
  // the stylist who no-showed — this is an internal HR matter).
  const { users } = await import("@/db/schema");
  const { inArray, ne, and: andOp } = await import("drizzle-orm");
  const otherAdmins = await db
    .select()
    .from(users)
    .where(andOp(inArray(users.role, ["owner", "admin", "manager"]), ne(users.id, session.userId)));
  const [staffMember] = await db.select().from(users).where(eq(users.id, parsed.data.staffId));
  await Promise.all(
    otherAdmins.map((a) =>
      notify({
        userId: a.id,
        type: "staff_no_show",
        title: "Staff no-show recorded",
        body: `${staffMember?.name ?? "A staff member"} was marked as a no-show for ${parsed.data.scheduledDate}.`,
      })
    )
  );

  revalidatePath(`/admin/staff/${parsed.data.staffId}`);
  return { ok: true as const };
}

export async function setNoShowStatus(noShowId: string, status: "unexcused" | "excused" | "under_review") {
  const session = await requireRole(...HR_ROLES);
  const [before] = await db.select().from(staffNoShows).where(eq(staffNoShows.id, noShowId));
  if (!before) return { ok: false as const, error: "Record not found." };
  await db.update(staffNoShows).set({ status }).where(eq(staffNoShows.id, noShowId));
  await recordAudit({ session, action: "staff_no_show_status_changed", entityType: "staff_no_show", entityId: noShowId, before: { status: before.status }, after: { status } });
  revalidatePath(`/admin/staff/${before.staffId}`);
  return { ok: true as const };
}

export async function listStaffNoShows(staffId: string) {
  await requireRole(...HR_ROLES);
  return db.select().from(staffNoShows).where(eq(staffNoShows.staffId, staffId)).orderBy(desc(staffNoShows.createdAt));
}

/** ---------------- ADVANCES / DEBT ---------------- */
const advanceSchema = z.object({
  staffId: z.string(),
  entryType: z.enum(["advance", "deduction", "repayment", "no_show_debit"]),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

/** Every entry is auditable and running-balance based — advances/deductions
 * increase what's owed, repayments/further deductions reduce it. Debt from
 * a no-show is NEVER created automatically; it must be entered here as an
 * explicit `no_show_debit` entry by a manager/owner, per the "configurable
 * business rule, not automatic" requirement. */
export async function recordStaffAdvanceEntry(input: z.infer<typeof advanceSchema>) {
  const session = await requireRole(...HR_ROLES);
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const history = await db.select().from(staffAdvances).where(eq(staffAdvances.staffId, parsed.data.staffId)).orderBy(desc(staffAdvances.createdAt));
  const currentBalance = history[0]?.balanceAfter ?? 0;

  const increases = parsed.data.entryType === "advance" || parsed.data.entryType === "no_show_debit";
  const balanceAfter = increases ? currentBalance + parsed.data.amount : Math.max(0, currentBalance - parsed.data.amount);

  const [created] = await db
    .insert(staffAdvances)
    .values({ ...parsed.data, reason: parsed.data.reason || null, balanceAfter, recordedByUserId: session.userId })
    .returning();

  await recordAudit({
    session,
    action: "staff_advance_entry_recorded",
    entityType: "staff_advance",
    entityId: created.id,
    before: { balance: currentBalance },
    after: { entryType: parsed.data.entryType, amount: parsed.data.amount, balanceAfter },
  });

  revalidatePath(`/admin/staff/${parsed.data.staffId}`);
  return { ok: true as const, balanceAfter };
}

export async function listStaffAdvances(staffId: string) {
  await requireRole(...HR_ROLES);
  return db.select().from(staffAdvances).where(eq(staffAdvances.staffId, staffId)).orderBy(desc(staffAdvances.createdAt));
}

/** ---------------- UNIFORMS / SCRUBS ---------------- */
const uniformSchema = z.object({
  staffId: z.string(),
  item: z.string().min(1),
  size: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  issueDate: z.string().min(1),
  notes: z.string().optional(),
});

export async function issueUniform(input: z.infer<typeof uniformSchema>) {
  const session = await requireRole(...HR_ROLES);
  const parsed = uniformSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const [created] = await db
    .insert(uniformIssues)
    .values({ ...parsed.data, size: parsed.data.size || null, notes: parsed.data.notes || null, recordedByUserId: session.userId })
    .returning();

  await recordAudit({ session, action: "uniform_issued", entityType: "uniform_issue", entityId: created.id, after: parsed.data });
  revalidatePath(`/admin/staff/${parsed.data.staffId}`);
  return { ok: true as const };
}

export async function returnUniform(uniformId: string, condition: string) {
  const session = await requireRole(...HR_ROLES);
  const [before] = await db.select().from(uniformIssues).where(eq(uniformIssues.id, uniformId));
  if (!before) return { ok: false as const, error: "Record not found." };

  await db
    .update(uniformIssues)
    .set({ status: "returned", returnDate: new Date().toISOString().slice(0, 10), condition })
    .where(eq(uniformIssues.id, uniformId));

  await recordAudit({ session, action: "uniform_returned", entityType: "uniform_issue", entityId: uniformId, before: { status: before.status }, after: { status: "returned", condition } });
  revalidatePath(`/admin/staff/${before.staffId}`);
  return { ok: true as const };
}

export async function listUniformIssues(staffId: string) {
  await requireRole(...HR_ROLES);
  return db.select().from(uniformIssues).where(eq(uniformIssues.staffId, staffId)).orderBy(desc(uniformIssues.createdAt));
}
