import { listInventoryItems } from "@/lib/actions/inventory";
import { InventoryTable } from "./InventoryTable";
import { AddItemForm } from "./AddItemForm";

export default async function AdminInventoryPage() {
  const items = await listInventoryItems();
  const lowStock = items.filter((i) => i.active && i.quantity <= i.minThreshold);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Inventory</h1>
        {lowStock.length > 0 && (
          <span className="rounded-full bg-rust/10 px-3 py-1 text-xs font-medium text-rust">
            {lowStock.length} item(s) low on stock
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InventoryTable items={items} />
        </div>
        <AddItemForm />
      </div>
    </div>
  );
}
