"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { resolveCancellationRequest } from "@/lib/actions/booking";
import { resolveRescheduleRequest } from "@/lib/actions/reschedule";

type Appt = { id: string; customerName: string; scheduledDate: string; scheduledTime: string };
type Reschedule = {
  id: string;
  appointmentId: string;
  requestedDate: string;
  requestedTime: string;
  reason: string | null;
  previousDate: string;
  previousTime: string;
};

export function RequestsPanel({ cancellations, reschedules }: { cancellations: Appt[]; reschedules: Reschedule[] }) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Cancellation requests ({cancellations.length})</h2>
        {cancellations.length === 0 && <p className="text-sm text-ink-soft">None pending.</p>}
        <div className="space-y-3">
          {cancellations.map((a) => (
            <CancellationRow key={a.id} appt={a} onResolved={() => router.refresh()} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Reschedule requests ({reschedules.length})</h2>
        {reschedules.length === 0 && <p className="text-sm text-ink-soft">None pending.</p>}
        <div className="space-y-3">
          {reschedules.map((r) => (
            <RescheduleRow key={r.id} request={r} onResolved={() => router.refresh()} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CancellationRow({ appt, onResolved }: { appt: Appt; onResolved: () => void }) {
  const [pending, setPending] = useState(false);

  async function decide(decision: "approved" | "declined") {
    setPending(true);
    await resolveCancellationRequest({ appointmentId: appt.id, decision });
    setPending(false);
    onResolved();
  }

  return (
    <Card className="flex items-center justify-between p-4">
      <div>
        <Link href={`/admin/appointments/${appt.id}`} className="text-sm font-medium text-ink hover:underline">
          {appt.customerName}
        </Link>
        <p className="text-xs text-ink-soft">{appt.scheduledDate} at {appt.scheduledTime}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => decide("approved")}>Approve</Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => decide("declined")}>Decline</Button>
      </div>
    </Card>
  );
}

function RescheduleRow({ request, onResolved }: { request: Reschedule; onResolved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "declined") {
    setPending(true);
    setError(null);
    const result = await resolveRescheduleRequest({ requestId: request.id, decision });
    setPending(false);
    if (!result.ok) return setError(result.error);
    onResolved();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/appointments/${request.appointmentId}`} className="text-sm font-medium text-ink hover:underline">
            {request.previousDate} {request.previousTime} → {request.requestedDate} {request.requestedTime}
          </Link>
          {request.reason && <p className="mt-0.5 text-xs text-ink-soft">{request.reason}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={() => decide("approved")}>Approve</Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => decide("declined")}>Decline</Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
    </Card>
  );
}
