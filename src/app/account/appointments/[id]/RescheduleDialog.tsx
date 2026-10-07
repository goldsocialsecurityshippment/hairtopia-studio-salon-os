"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestReschedule } from "@/lib/actions/reschedule";
import { getAvailableSlots } from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function RescheduleDialog({
  appointmentId,
  stylistId,
  serviceId,
}: {
  appointmentId: string;
  stylistId: string;
  serviceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setTime("");
    getAvailableSlots({ stylistId, serviceId, date, excludeAppointmentId: appointmentId })
      .then(setSlots)
      .finally(() => setLoadingSlots(false));
  }, [date, stylistId, serviceId, appointmentId]);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await requestReschedule({ appointmentId, requestedDate: date, requestedTime: time, reason: reason || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setDone(true);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Request reschedule
      </Button>
    );
  }

  if (done) {
    return (
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="text-sm font-medium text-ink">Reschedule request sent</p>
        <p className="mt-1 text-xs text-ink-soft">
          The salon will review your request and confirm shortly — your original time still stands until then.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="text-sm font-medium text-ink">Request a new date/time</p>
      <p className="mt-1 text-xs text-ink-soft">
        Subject to our rescheduling window — staff will confirm before anything changes.
      </p>
      <div className="mt-4 space-y-3">
        <Input label="New date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
        {date && (
          <div>
            <p className="mb-1 text-xs text-ink-soft">Available times</p>
            {loadingSlots ? (
              <p className="text-xs text-ink-soft">Checking availability…</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-ink-soft">No open slots that day — try another date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTime(s)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      time === s ? "border-ink bg-ink text-canvas" : "border-line text-ink-soft"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={handleSubmit} loading={pending} disabled={!date || !time}>
          Send request
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </div>
  );
}
