"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/lib/actions/payments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function StylistPaymentConfirm({
  appointmentId,
  priceEstimate,
  paymentStatus,
}: {
  appointmentId: string;
  priceEstimate: number;
  paymentStatus: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(priceEstimate);
  const [method, setMethod] = useState<"cash" | "mobile_money" | "card" | "bank_transfer">("cash");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (paymentStatus === "paid") {
    return <span className="text-xs font-medium text-moss">Paid ✓</span>;
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Confirm payment
      </Button>
    );
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await recordPayment({ appointmentId, amount, method, paymentType: "full" });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="rounded-sm border border-line bg-canvas p-3">
      <div className="flex gap-2">
        <Input
          label="Amount (GH₵)"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-28"
        />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-32">
          <option value="cash">Cash</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Transfer</option>
        </Select>
      </div>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleConfirm} loading={pending}>
          Mark as paid
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
