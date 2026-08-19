"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelAppointment } from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const REASONS = [
  { value: "changed_plans", label: "Changed plans" },
  { value: "emergency", label: "Emergency" },
  { value: "schedule_conflict", label: "Schedule conflict" },
  { value: "service_issue", label: "Service issue" },
  { value: "other", label: "Other" },
] as const;

export function CancelDialog({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof REASONS[number]["value"]>("changed_plans");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setPending(true);
    setError(null);
    const result = await cancelAppointment({ appointmentId, reason, note: note || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancel appointment
      </Button>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="text-sm font-medium text-ink">Cancel this appointment?</p>
      <p className="mt-1 text-xs text-ink-soft">Please let us know why, so we can improve.</p>
      <div className="mt-4 space-y-3">
        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Textarea label="Additional notes (optional)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button variant="danger" onClick={handleCancel} loading={pending}>
          Confirm cancellation
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Keep appointment
        </Button>
      </div>
    </div>
  );
}
