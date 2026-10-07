"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { updateClientProfile } from "@/lib/actions/crm";

type ClientData = {
  hairType?: string | null;
  hairLength?: string | null;
  hairDensity?: string | null;
  hairCondition?: string | null;
  scalpCondition?: string | null;
  scalpConcerns?: string | null;
  hairStatus?: string | null;
  allergies?: string | null;
  sensitivities?: string | null;
  previousReactions?: string | null;
  preferredProducts?: string | null;
  specialRequests?: string | null;
  notes?: string | null;
};

export function ClientIntakeForm({
  clientId,
  client,
  scope,
}: {
  clientId: string;
  client: ClientData;
  scope: string;
}) {
  const router = useRouter();
  const canEdit = scope === "full" || scope === "assigned";
  const [form, setForm] = useState({
    hairType: client.hairType ?? "",
    hairLength: client.hairLength ?? "",
    hairDensity: client.hairDensity ?? "",
    hairCondition: client.hairCondition ?? "",
    scalpCondition: client.scalpCondition ?? "",
    scalpConcerns: client.scalpConcerns ?? "",
    hairStatus: client.hairStatus ?? "unspecified",
    allergies: client.allergies ?? "",
    sensitivities: client.sensitivities ?? "",
    previousReactions: client.previousReactions ?? "",
    preferredProducts: client.preferredProducts ?? "",
    specialRequests: client.specialRequests ?? "",
    notes: client.notes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setPending(true);
    setSaved(false);
    await updateClientProfile({
      clientId,
      ...form,
      hairStatus: form.hairStatus as "natural" | "relaxed" | "transitioning" | "colour_treated" | "unspecified",
    });
    setPending(false);
    setSaved(true);
    router.refresh();
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Card className="p-5">
      <p className="font-display text-lg text-ink">Hair & scalp intake</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input label="Hair type" value={form.hairType} onChange={set("hairType")} disabled={!canEdit} />
        <Input label="Hair length" value={form.hairLength} onChange={set("hairLength")} disabled={!canEdit} />
        <Input label="Hair density" value={form.hairDensity} onChange={set("hairDensity")} disabled={!canEdit} />
        <Select label="Hair status" value={form.hairStatus} onChange={set("hairStatus")} disabled={!canEdit}>
          <option value="unspecified">Unspecified</option>
          <option value="natural">Natural</option>
          <option value="relaxed">Relaxed</option>
          <option value="transitioning">Transitioning</option>
          <option value="colour_treated">Colour-treated</option>
        </Select>
        <Input label="Hair condition" value={form.hairCondition} onChange={set("hairCondition")} disabled={!canEdit} />
        <Input label="Scalp condition" value={form.scalpCondition} onChange={set("scalpCondition")} disabled={!canEdit} />
      </div>
      <Textarea label="Scalp concerns" value={form.scalpConcerns} onChange={set("scalpConcerns")} disabled={!canEdit} className="mt-3" />
      <Textarea label="Allergies" value={form.allergies} onChange={set("allergies")} disabled={!canEdit} className="mt-3" />
      <Textarea label="Sensitivities / previous reactions" value={form.previousReactions} onChange={set("previousReactions")} disabled={!canEdit} className="mt-3" />
      <Textarea label="Preferred products" value={form.preferredProducts} onChange={set("preferredProducts")} disabled={!canEdit} className="mt-3" />
      <Textarea label="Special requests" value={form.specialRequests} onChange={set("specialRequests")} disabled={!canEdit} className="mt-3" />

      {scope === "full" && (
        <Textarea
          label="Private front-of-house notes (Owner / Trusted Admin only)"
          value={form.notes}
          onChange={set("notes")}
          className="mt-3"
        />
      )}

      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" loading={pending} onClick={save}>Save changes</Button>
          {saved && <span className="text-xs text-ink-soft">Saved.</span>}
        </div>
      )}
    </Card>
  );
}
