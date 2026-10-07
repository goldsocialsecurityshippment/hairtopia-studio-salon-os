"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentFinalPrice } from "@/lib/actions/booking";

export function FinalPriceForm({
  appointmentId,
  currentPrice,
  priceMin,
  priceMax,
}: {
  appointmentId: string;
  currentPrice: number;
  priceMin: number;
  priceMax: number;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(currentPrice);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await setAppointmentFinalPrice(appointmentId, price);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-2 border-t border-line pt-2">
      <p className="text-xs text-ink-soft">Range: GH₵{priceMin}–{priceMax}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          value={price}
          min={priceMin}
          max={priceMax}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-24 rounded-sm border border-line px-2 py-1 text-sm"
        />
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-sm bg-ink px-2.5 py-1 text-xs text-canvas hover:bg-ink/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Confirm price"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rust">{error}</p>}
    </div>
  );
}
