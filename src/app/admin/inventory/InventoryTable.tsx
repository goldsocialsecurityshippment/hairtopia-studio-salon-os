"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { recordInventoryMovement, setInventoryItemActive } from "@/lib/actions/inventory";

type Item = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  minThreshold: number;
  unit: string;
  cost: number | null;
  sellingPrice: number | null;
  active: boolean;
};

export function InventoryTable({ items }: { items: Item[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Move stock</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-soft">No inventory items yet.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function Row({ item }: { item: Item }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<"stock_in" | "stock_out" | "adjustment" | "damaged" | "used" | "transferred">("stock_in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const low = item.quantity <= item.minThreshold;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await recordInventoryMovement({ itemId: item.id, movementType: type, quantity: qty });
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{item.name}</p>
        <p className="text-xs text-ink-soft">{item.category ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        <span className={low ? "font-medium text-rust" : "text-ink"}>{item.quantity} {item.unit}</span>
        {low && <p className="text-xs text-rust">Low stock (min {item.minThreshold})</p>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-32">
            <option value="stock_in">Stock in</option>
            <option value="stock_out">Stock out</option>
            <option value="used">Used</option>
            <option value="damaged">Damaged</option>
            <option value="transferred">Transferred</option>
            <option value="adjustment">Adjustment</option>
          </Select>
          <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-20" min={1} />
          <Button size="sm" loading={pending} onClick={submit}>Go</Button>
        </div>
        {error && <p className="mt-1 text-xs text-rust">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => { await setInventoryItemActive(item.id, !item.active); router.refresh(); }}
        >
          {item.active ? "Deactivate" : "Activate"}
        </Button>
      </td>
    </tr>
  );
}
