import { describe, it, expect, beforeAll, vi } from "vitest";

// Resolve auth instantly so concurrent calls genuinely interleave at the
// database step (with real async JWT verification the calls get staggered
// and this race is masked).
vi.mock("@/lib/auth/session", () => ({
  requireRole: async () => ({ userId: "race-manager", role: "manager", name: "m" }),
  getSession: async () => ({ userId: "race-manager", role: "manager", name: "m" }),
}));

import { db } from "@/db";
import { inventoryItems, inventoryMovements, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createInventoryItem, recordInventoryMovement } from "@/lib/actions/inventory";

beforeAll(async () => {
  await db.insert(users).values({ id: "race-manager", role: "manager", name: "Race Manager", phone: "+233200000999", passwordHash: "x" }).onConflictDoNothing();
});

describe("Inventory atomicity (forced interleaving)", () => {
  it("10 truly concurrent 'take 1' against 4 in stock: exactly 4 succeed, stock ends at exactly 0", async () => {
    const created = await createInventoryItem({ name: "Race item " + Math.random(), quantity: 4, minThreshold: 0, unit: "unit" });
    if (!created.ok) throw new Error("setup failed");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => recordInventoryMovement({ itemId: created.id, movementType: "stock_out", quantity: 1 }))
    );

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, created.id));
    const succeeded = results.filter((r) => r.ok).length;
    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, created.id));
    const net = moves.reduce((sum, m) => sum + m.quantityChange, 0);

    console.log({ succeeded, finalQuantity: item.quantity, netOfHistory: net });

    expect(item.quantity).toBe(0);
    expect(succeeded).toBe(4);
    expect(net).toBe(0);
  });
});
