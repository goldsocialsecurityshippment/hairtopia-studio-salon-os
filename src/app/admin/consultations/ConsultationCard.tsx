"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  sendConsultationRecommendation,
  setConsultationStatus,
  convertConsultationToBooking,
} from "@/lib/actions/consultations";

type Consultation = {
  id: string;
  customerName: string;
  customerPhone: string;
  category: string;
  concerns: string;
  status: string;
  staffRecommendation: string | null;
  suggestedServiceId: string | null;
  suggestedPrice: number | null;
  preferredDate: string | null;
  photos: { id: string; url: string; caption: string | null }[];
};

export function ConsultationCard({
  consultation,
  services,
}: {
  consultation: Consultation;
  services: { id: string; name: string; categoryName: string }[];
}) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState(consultation.staffRecommendation ?? "");
  const [serviceId, setServiceId] = useState(consultation.suggestedServiceId ?? "");
  const [price, setPrice] = useState(consultation.suggestedPrice ?? 0);
  const [pending, setPending] = useState(false);

  async function sendRecommendation() {
    setPending(true);
    await sendConsultationRecommendation({
      consultationId: consultation.id,
      staffRecommendation: recommendation,
      suggestedServiceId: serviceId || undefined,
      suggestedPrice: price || undefined,
    });
    setPending(false);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-base text-ink">{consultation.customerName}</p>
          <p className="text-xs text-ink-soft">{consultation.customerPhone} · {consultation.category}</p>
        </div>
        <Badge tone={consultation.status === "converted" ? "success" : "neutral"}>
          {consultation.status.replace("_", " ")}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-ink-soft">{consultation.concerns}</p>

      {consultation.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {consultation.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Reference photo"}
                className="aspect-square rounded-sm border border-line object-cover hover:opacity-80"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          ))}
        </div>
      )}

      {consultation.status !== "converted" && consultation.status !== "declined" && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <Textarea label="Recommendation to send" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Suggested service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">None yet</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.categoryName} — {s.name}</option>)}
            </Select>
            <Input label="Suggested price (GH₵)" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} disabled={!recommendation} onClick={sendRecommendation}>
              Send recommendation
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => { await setConsultationStatus(consultation.id, "under_review"); router.refresh(); }}>
              Mark under review
            </Button>
            <Button size="sm" variant="danger" onClick={async () => { await setConsultationStatus(consultation.id, "declined"); router.refresh(); }}>
              Decline
            </Button>
          </div>
        </div>
      )}

      {consultation.status === "recommendation_sent" && consultation.suggestedServiceId && (
        <ConvertForm consultationId={consultation.id} />
      )}
    </Card>
  );
}

function ConvertForm({ consultationId }: { consultationId: string }) {
  const router = useRouter();
  const [stylistId, setStylistId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    setPending(true);
    setError(null);
    const result = await convertConsultationToBooking(consultationId, stylistId, date, time);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-sm border border-bronze-200 bg-bronze-50/50 p-3">
      <p className="text-xs font-medium text-ink">Convert to booking</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Stylist ID" value={stylistId} onChange={(e) => setStylistId(e.target.value)} />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {error && <p className="mt-1 text-xs text-rust">{error}</p>}
      <Button size="sm" className="mt-2" loading={pending} disabled={!stylistId || !date || !time} onClick={convert}>
        Convert
      </Button>
    </div>
  );
}
