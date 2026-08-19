"use client";

import { useMemo, useState } from "react";
import { createWalkIn } from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

type Variation = { id: string; label: string; price: number };
type ServiceLite = {
  id: string;
  name: string;
  priceMin: number;
  priceMax: number | null;
  variations: Variation[];
};
type Category = { id: string; name: string; services: ServiceLite[] };
type StylistLite = { id: string; name: string; serviceIds: string[] };

export function WalkInForm({
  categories,
  stylists,
}: {
  categories: Category[];
  stylists: StylistLite[];
}) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [stylistId, setStylistId] = useState<string>("any");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const allServices = useMemo(() => categories.flatMap((c) => c.services), [categories]);
  const selectedService = allServices.find((s) => s.id === serviceId) ?? null;
  const eligibleStylists = stylists.filter((s) => serviceId && s.serviceIds.includes(serviceId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId) {
      setError("Please choose a service.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createWalkIn({
      serviceId,
      variationId: variationId ?? undefined,
      stylistId: stylistId === "any" ? undefined : stylistId,
      customerName,
      customerPhone,
      instructions: instructions || undefined,
      source: "qr",
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setJoined(true);
  }

  if (joined) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-2xl text-ink">You&apos;re in the queue</p>
        <p className="mt-2 text-sm text-ink-soft">
          A team member will call you shortly. Thanks for your patience, {customerName.split(" ")[0]}.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="rounded-sm bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p>}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Choose a service</p>
        <select
          className="w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:ring-1 focus:ring-bronze-400"
          value={serviceId ?? ""}
          onChange={(e) => {
            setServiceId(e.target.value || null);
            setVariationId(null);
            setStylistId("any");
          }}
        >
          <option value="">Select a service…</option>
          {categories.map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              {cat.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (GH₵{s.priceMin}{s.priceMax ? `–${s.priceMax}` : "+"})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedService && selectedService.variations.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Choose an option</p>
          <select
            className="w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:ring-1 focus:ring-bronze-400"
            value={variationId ?? ""}
            onChange={(e) => setVariationId(e.target.value || null)}
          >
            <option value="">Select an option…</option>
            {selectedService.variations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — GH₵{v.price}
              </option>
            ))}
          </select>
        </div>
      )}

      {serviceId && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Preferred stylist</p>
          <select
            className="w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:ring-1 focus:ring-bronze-400"
            value={stylistId}
            onChange={(e) => setStylistId(e.target.value)}
          >
            <option value="any">No preference — first available</option>
            {eligibleStylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Input label="Your name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
      <Input label="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
      <Textarea
        label="Instructions (optional)"
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />

      <Button type="submit" className="w-full" loading={submitting}>
        I&apos;m here — join the queue
      </Button>
    </form>
  );
}
