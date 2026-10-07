"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createInventoryItem } from "@/lib/actions/inventory";

export function AddItemForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [minThreshold, setMinThreshold] = useState(5);
  const [cost, setCost] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createInventoryItem({ name, category: category || undefined, quantity, minThreshold, cost: cost || undefined, unit: "unit" });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setName("");
    setCategory("");
    setQuantity(0);
    router.refresh();
  }

  return (
    <Card className="h-fit p-5">
      <p className="font-display text-lg text-ink">Add item</p>
      <div className="mt-4 space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Starting qty" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          <Input label="Low-stock threshold" type="number" value={minThreshold} onChange={(e) => setMinThreshold(Number(e.target.value))} />
        </div>
        <Input label="Unit cost (GH₵, optional)" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
        {error && <p className="text-xs text-rust">{error}</p>}
        <Button size="sm" className="w-full" loading={pending} disabled={!name} onClick={submit}>
          Add to inventory
        </Button>
      </div>
    </Card>
  );
}
