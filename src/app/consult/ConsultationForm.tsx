"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { requestConsultation } from "@/lib/actions/consultations";

const CATEGORIES = ["Natural Hair", "Loc Maintenance", "Colour & Chemical", "Scalp Health", "Styling for an Event"];

export function ConsultationForm({
  stylists,
  defaultName,
  defaultPhone,
}: {
  stylists: { id: string; name: string }[];
  defaultName: string;
  defaultPhone: string;
}) {
  const [customerName, setCustomerName] = useState(defaultName);
  const [customerPhone, setCustomerPhone] = useState(defaultPhone);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [requestedStylistId, setRequestedStylistId] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [concerns, setConcerns] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/consultation-photo", { method: "POST", body: formData });
        const data = await res.json();
        if (res.ok) setPhotoUrls((prev) => [...prev, data.url]);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await requestConsultation({
      customerName,
      customerPhone,
      category,
      requestedStylistId: requestedStylistId || undefined,
      preferredDate: preferredDate || undefined,
      concerns,
      photoUrls: photoUrls.length ? photoUrls : undefined,
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-sm border border-line bg-bronze-50/50 p-6 text-center">
        <p className="font-display text-lg text-ink">Request received</p>
        <p className="mt-2 text-sm text-ink-soft">
          A member of our team will review your consultation and follow up with a recommendation.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        <Input label="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
      </div>
      <Select label="Consultation category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </Select>
      <Select label="Preferred professional (optional)" value={requestedStylistId} onChange={(e) => setRequestedStylistId(e.target.value)}>
        <option value="">No preference</option>
        {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Input label="Preferred date (optional)" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
      <Textarea
        label="Tell us about your hair and concerns"
        value={concerns}
        onChange={(e) => setConcerns(e.target.value)}
        rows={5}
        required
      />
      <label className="block">
        <span className="mb-1 block text-xs text-ink-soft">Reference/inspiration photos (optional)</span>
        <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} className="text-xs" />
        {uploading && <span className="ml-2 text-xs text-ink-soft">Uploading…</span>}
        {photoUrls.length > 0 && <span className="ml-2 text-xs text-moss">{photoUrls.length} photo(s) attached</span>}
      </label>
      {error && <p className="text-sm text-rust">{error}</p>}
      <Button type="submit" loading={pending} className="w-full">Request consultation</Button>
    </form>
  );
}
