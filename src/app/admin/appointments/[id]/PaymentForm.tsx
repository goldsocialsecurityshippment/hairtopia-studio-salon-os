"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/lib/actions/payments";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  timestamp: string;
  note: string | null;
};

export function PaymentForm({
  appointmentId,
  priceEstimate,
  currentStatus,
  history,
}: {
  appointmentId: string;
  priceEstimate: number;
  currentStatus: string;
  history: Payment[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(priceEstimate);
  const [method, setMethod] = useState<"cash" | "mobile_money" | "card" | "bank_transfer">("cash");
  const [paymentType, setPaymentType] = useState<"deposit" | "final" | "full">("full");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await recordPayment({ appointmentId, amount, method, paymentType, note: note || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setConfirmed(true);
    router.refresh();
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg text-ink">Payment</p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            currentStatus === "paid" ? "bg-moss/10 text-moss" : "bg-amber/10 text-amber"
          }`}
        >
          {currentStatus === "paid" ? "Paid" : currentStatus[0].toUpperCase() + currentStatus.slice(1)}
        </span>
      </div>

      {history.length > 0 && (
        <div className="mt-4 space-y-2 border-b border-line pb-4">
          {history.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-soft">
                {new Date(p.timestamp).toLocaleDateString()} · {p.method.replace("_", " ")}
              </span>
              <span className="font-medium text-ink">GH₵{p.amount}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Input
          label="Amount (GH₵)"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
        />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="cash">Cash</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
        </Select>
        <Select label="Type" value={paymentType} onChange={(e) => setPaymentType(e.target.value as typeof paymentType)}>
          <option value="full">Full payment</option>
          <option value="deposit">Deposit</option>
          <option value="final">Final balance</option>
        </Select>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-sm text-rust">{error}</p>}
        {confirmed && <p className="text-sm text-moss">Payment recorded.</p>}
        <Button type="submit" className="w-full" loading={pending}>
          Confirm payment
        </Button>
      </form>
    </div>
  );
}
