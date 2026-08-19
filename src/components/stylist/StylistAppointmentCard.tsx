"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startService, completeService } from "@/lib/actions/service-flow";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { StylistPaymentConfirm } from "./StylistPaymentConfirm";

type Appt = {
  id: string;
  customerName: string;
  customerPhone: string;
  scheduledTime: string;
  status: string;
  instructions: string | null;
  serviceName: string;
  customerArrivedAt: string | null;
  priceEstimate?: number;
  paymentStatus?: string;
};

export function StylistAppointmentCard({ appt }: { appt: Appt }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  async function handleStart() {
    setPending(true);
    setError(null);
    const result = await startService(appt.id);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    if (mediaUrls.length + files.length > 3) {
      setError("You can attach up to 3 photos or videos per appointment.");
      return;
    }
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        continue;
      }
      setMediaUrls((prev) => [...prev, data.url]);
    }
    setUploading(false);
  }

  async function handleComplete() {
    setPending(true);
    setError(null);
    const result = await completeService({ appointmentId: appt.id, mediaUrls });
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{appt.customerName}</p>
          <p className="text-xs text-ink-soft">{appt.serviceName} · {appt.scheduledTime}</p>
        </div>
        <Badge tone={statusTone(appt.status)}>{statusLabel(appt.status)}</Badge>
      </div>

      {appt.instructions && (
        <p className="mt-2 rounded-sm bg-bronze-50 px-3 py-2 text-xs text-ink-soft">
          <span className="font-medium text-ink">Customer request: </span>
          {appt.instructions}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-rust">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/stylist/appointments/${appt.id}`} className="text-xs font-medium text-bronze-500 hover:underline">
          View details
        </Link>

        {(appt.status === "arrived" || appt.status === "confirmed") && (
          <Button size="sm" onClick={handleStart} loading={pending}>
            Start Service
          </Button>
        )}

        {appt.status === "in_service" && (
          <>
            {mediaUrls.length < 3 && (
              <label className="cursor-pointer rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/40">
                {mediaUrls.length > 0 ? `Add another (${mediaUrls.length}/3)` : "Add finished-look photo/video"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </label>
            )}
            {mediaUrls.length > 0 && (
              <span className="text-xs text-moss">{mediaUrls.length} file(s) attached ✓</span>
            )}
            {uploading && <span className="text-xs text-ink-soft">Uploading…</span>}
            <Button size="sm" onClick={handleComplete} loading={pending}>
              Complete Service
            </Button>
          </>
        )}

        {appt.status === "completed" && appt.priceEstimate != null && (
          <StylistPaymentConfirm
            appointmentId={appt.id}
            priceEstimate={appt.priceEstimate}
            paymentStatus={appt.paymentStatus ?? "pending"}
          />
        )}
      </div>
    </div>
  );
}
