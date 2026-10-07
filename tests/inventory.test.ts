import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/db";
import { inventoryItems, inventoryMovements, notifications, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createInventoryItem, recordInventoryMovement, listLowStockItems } from "@/lib/actions/inventory";
import { signInAs, signOut, makeUser } from "./helpers";

let manager: Awaited<ReturnType<typeof makeUser>>;
let stylist: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  manager = await makeUser("manager", "Inv Manager");
  stylist = await makeUser("stylist", "Inv Stylist");
});
afterEach(() => signOut());

async function newItem(quantity: number, minThreshold = 2) {
  await signInAs({ id: manager.id, role: "manager", name: "m" });
  const r = await createInventoryItem({ name: "Item " + Math.random(), quantity, minThreshold, unit: "unit" });
  if (!r.ok) throw new Error("setup failed");
  return r.id;
}

describe("Inventory: stock movements", () => {
  it("stock in / out update quantity and write a full movement history (previous → new)", async () => {
    const id = await newItem(10);
    await recordInventoryMovement({ itemId: id, movementType: "stock_in", quantity: 5, reason: "restock" });
    await recordInventoryMovement({ itemId: id, movementType: "used", quantity: 3, reason: "service" });

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    expect(item.quantity).toBe(12);

    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, id));
    // initial stock + stock_in + used
    expect(moves.length).toBe(3);
    const used = moves.find((m) => m.movementType === "used")!;
    expect(used.previousQuantity).toBe(15);
    expect(used.newQuantity).toBe(12);
    expect(used.recordedByUserId).toBe(manager.id);
  });

  it("refuses to take more stock than exists (no negative inventory), and changes nothing", async () => {
    const id = await newItem(2);
    const r = await recordInventoryMovement({ itemId: id, movementType: "stock_out", quantity: 5 });
    expect(r.ok).toBe(false);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    expect(item.quantity).toBe(2);
  });

  it("writes an audit log entry for every movement", async () => {
    const id = await newItem(4);
    const r = await recordInventoryMovement({ itemId: id, movementType: "damaged", quantity: 1, reason: "spilled" });
    expect(r.ok).toBe(true);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "inventory_movement_recorded"));
    expect(logs.length).toBeGreaterThan(0);
  });

  it("crossing the low-stock threshold notifies back-office staff", async () => {
    const id = await newItem(5, 3);
    await recordInventoryMovement({ itemId: id, movementType: "used", quantity: 3 }); // 5 -> 2 <= 3
    const rows = await db.select().from(notifications).where(eq(notifications.userId, manager.id));
    expect(rows.some((n) => n.type === "low_inventory")).toBe(true);
    const low = await listLowStockItems();
    expect(low.some((i) => i.id === id)).toBe(true);
  });

  it("stylists cannot touch inventory", async () => {
    const id = await newItem(5);
    await signInAs({ id: stylist.id, role: "stylist", name: "s" });
    await expect(recordInventoryMovement({ itemId: id, movementType: "stock_out", quantity: 1 })).rejects.toThrow("FORBIDDEN");
    await expect(createInventoryItem({ name: "x", quantity: 1, minThreshold: 1, unit: "unit" })).rejects.toThrow("FORBIDDEN");
  });
});

describe("Inventory: atomicity under concurrent updates", () => {
  it("10 simultaneous 'take 1' requests against 4 in stock: exactly 4 succeed, stock ends at 0, never negative, history is consistent", async () => {
    const id = await newItem(4, 0);
    await signInAs({ id: manager.id, role: "manager", name: "m" });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => recordInventoryMovement({ itemId: id, movementType: "stock_out", quantity: 1 }))
    );

    const succeeded = results.filter((r) => r.ok).length;
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));

    expect(item.quantity).toBe(0);
    expect(succeeded).toBe(4);

    // The movement history must reconcile with the final quantity: initial 4 + sum of changes = final.
    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, id));
    const net = moves.reduce((sum, m) => sum + m.quantityChange, 0);
    expect(net).toBe(0 /* +4 initial, -4 removed */);
    // and every row's previous→new must be internally consistent
    for (const m of moves) expect(m.newQuantity - m.previousQuantity).toBe(m.quantityChange);
  });
});
