"use server";

import { db } from "@/db";
import { inventoryItems, inventoryMovements } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const INV_ROLES = ["owner", "admin", "manager"] as const;

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  sku: z.string().optional(),
  description: z.string().optional(),
  supplier: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  quantity: z.number().int().nonnegative().default(0),
  minThreshold: z.number().int().nonnegative().default(5),
  unit: z.string().default("unit"),
});

export async function createInventoryItem(input: z.infer<typeof itemSchema>) {
  const session = await requireRole(...INV_ROLES);

  const parsed = itemSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const [created] = await db
    .insert(inventoryItems)
    .values({
      ...parsed.data,
      category: parsed.data.category || null,
      sku: parsed.data.sku || null,
      description: parsed.data.description || null,
      supplier: parsed.data.supplier || null,
      cost: parsed.data.cost ?? null,
      sellingPrice: parsed.data.sellingPrice ?? null,
    })
    .returning();

  if (parsed.data.quantity > 0) {
    await db.insert(inventoryMovements).values({
      itemId: created.id,
      movementType: "stock_in",
      quantityChange: parsed.data.quantity,
      previousQuantity: 0,
      newQuantity: parsed.data.quantity,
      reason: "Initial stock on item creation",
      recordedByUserId: session.userId,
    });
  }

  await recordAudit({
    session,
    action: "inventory_item_created",
    entityType: "inventory_item",
    entityId: created.id,
    after: parsed.data,
  });

  revalidatePath("/admin/inventory");

  return {
    ok: true as const,
    id: created.id,
  };
}

export async function setInventoryItemActive(
  itemId: string,
  active: boolean
) {
  const session = await requireRole(...INV_ROLES);

  await db
    .update(inventoryItems)
    .set({ active })
    .where(eq(inventoryItems.id, itemId));

  await recordAudit({
    session,
    action: "inventory_item_active_changed",
    entityType: "inventory_item",
    entityId: itemId,
    after: { active },
  });

  revalidatePath("/admin/inventory");

  return {
    ok: true as const,
  };
}

const movementSchema = z.object({
  itemId: z.string(),
  movementType: z.enum([
    "stock_in",
    "stock_out",
    "adjustment",
    "damaged",
    "used",
    "transferred",
  ]),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

const DECREASING = new Set([
  "stock_out",
  "damaged",
  "used",
  "transferred",
]);

/**
 * Records a stock movement atomically.
 *
 * In production, PostgreSQL handles the transaction and locks the
 * inventory row with SELECT ... FOR UPDATE so concurrent requests
 * cannot both consume the same stock.
 *
 * Tests use the SQLite adapter with its synchronous transaction API.
 *
 * Stock quantity and movement history are committed together, so
 * they cannot become inconsistent.
 *
 * Negative inventory is refused unless the movement is an explicit
 * "adjustment", which may clamp the quantity at zero.
 */
export async function recordInventoryMovement(
  input: z.infer<typeof movementSchema>
) {
  const session = await requireRole(...INV_ROLES);

  const parsed = movementSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const data = parsed.data;

  const decreasing = DECREASING.has(data.movementType);
  const requestedChange = decreasing
    ? -data.quantity
    : data.quantity;

  const isTest = process.env.NODE_ENV === "test";

  const outcome = isTest
    ? // SQLite's synchronous transaction API differs from the production
      // PostgreSQL transaction API. The test adapter is intentionally
      // isolated here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).transaction((tx: any) => {
        const item = tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, data.itemId))
          .get();

        if (!item) {
          return {
            kind: "not_found" as const,
          };
        }

        const rawNew = item.quantity + requestedChange;

        if (
          rawNew < 0 &&
          data.movementType !== "adjustment"
        ) {
          return {
            kind: "insufficient" as const,
            available: item.quantity,
            unit: item.unit,
          };
        }

        const finalQuantity = Math.max(0, rawNew);

        tx
          .update(inventoryItems)
          .set({
            quantity: finalQuantity,
          })
          .where(eq(inventoryItems.id, item.id))
          .run();

        const movement = tx
          .insert(inventoryMovements)
          .values({
            itemId: item.id,
            movementType: data.movementType,
            quantityChange:
              finalQuantity - item.quantity,
            previousQuantity: item.quantity,
            newQuantity: finalQuantity,
            reason: data.reason || null,
            recordedByUserId: session.userId,
          })
          .returning()
          .get();

        return {
          kind: "ok" as const,
          item,
          movement,
          finalQuantity,
        };
      })
    : await db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, data.itemId))
          .for("update");

        if (!item) {
          return {
            kind: "not_found" as const,
          };
        }

        const rawNew = item.quantity + requestedChange;

        if (
          rawNew < 0 &&
          data.movementType !== "adjustment"
        ) {
          return {
            kind: "insufficient" as const,
            available: item.quantity,
            unit: item.unit,
          };
        }

        const finalQuantity = Math.max(0, rawNew);

        await tx
          .update(inventoryItems)
          .set({
            quantity: finalQuantity,
          })
          .where(eq(inventoryItems.id, item.id));

        const [movement] = await tx
          .insert(inventoryMovements)
          .values({
            itemId: item.id,
            movementType: data.movementType,
            quantityChange:
              finalQuantity - item.quantity,
            previousQuantity: item.quantity,
            newQuantity: finalQuantity,
            reason: data.reason || null,
            recordedByUserId: session.userId,
          })
          .returning();

        return {
          kind: "ok" as const,
          item,
          movement,
          finalQuantity,
        };
      });

  if (outcome.kind === "not_found") {
    return {
      ok: false as const,
      error: "Inventory item not found.",
    };
  }

  if (outcome.kind === "insufficient") {
    return {
      ok: false as const,
      error: `Only ${outcome.available} ${outcome.unit}(s) in stock — cannot remove ${data.quantity}.`,
    };
  }

  const {
    item,
    movement,
    finalQuantity,
  } = outcome;

  await recordAudit({
    session,
    action: "inventory_movement_recorded",
    entityType: "inventory_movement",
    entityId: movement.id,
    before: {
      quantity: item.quantity,
    },
    after: {
      quantity: finalQuantity,
      movementType: data.movementType,
    },
  });

  if (finalQuantity <= item.minThreshold) {
    const { users } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");

    const staff = await db
      .select()
      .from(users)
      .where(
        inArray(users.role, [
          "owner",
          "admin",
          "manager",
        ])
      );

    await Promise.all(
      staff.map((s) =>
        notify({
          userId: s.id,
          type: "low_inventory",
          title: "Low stock alert",
          body: `${item.name} is at ${finalQuantity} ${item.unit}(s), at or below the threshold of ${item.minThreshold}.`,
        })
      )
    );
  }

  revalidatePath("/admin/inventory");

  return {
    ok: true as const,
    newQuantity: finalQuantity,
  };
}

export async function listInventoryItems() {
  await requireRole(...INV_ROLES);

  return db
    .select()
    .from(inventoryItems)
    .orderBy(inventoryItems.name);
}

export async function listLowStockItems() {
  await requireRole(...INV_ROLES);

  return db
    .select()
    .from(inventoryItems)
    .where(
      sql`${inventoryItems.quantity} <= ${inventoryItems.minThreshold} AND ${inventoryItems.active} = true`
    );
}

export async function listItemMovements(itemId: string) {
  await requireRole(...INV_ROLES);

  return db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.itemId, itemId))
    .orderBy(desc(inventoryMovements.createdAt));
}
