"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callNextInQueue, updateQueueStatus } from "@/lib/actions/queue";
import { markNoShow } from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";

type Entry = {
  queueEntryId: string;
  appointmentId: string;
  status: string;
  customerName: string;
  serviceName: string;
  stylistId: string | null;
  joinedAt: string;
};

export function QueueBoard({ entries, stylists }: { entries: Entry[]; stylists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function assignAndCall(entryId: string, stylistId: string) {
    setPendingId(entryId);
    await callNextInQueue(entryId, stylistId);
    setPendingId(null);
    router.refresh();
  }

  async function markStatus(entryId: string, status: "in_service" | "completed" | "cancelled") {
    setPendingId(entryId);
    await updateQueueStatus(entryId, status);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={entry.queueEntryId} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bronze-100 font-display text-sm text-bronze-600">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{entry.customerName}</p>
              <p className="text-xs text-ink-soft">{entry.serviceName} · joined {new Date(entry.joinedAt).toLocaleTimeString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(entry.status)}>{statusLabel(entry.status)}</Badge>
            {entry.status === "waiting" && (
              <select
                className="rounded-sm border border-line px-2 py-1.5 text-xs"
                defaultValue=""
                disabled={pendingId === entry.queueEntryId}
                onChange={(e) => e.target.value && assignAndCall(entry.queueEntryId, e.target.value)}
              >
                <option value="" disabled>Assign & call…</option>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {entry.status === "called" && (
              <Button size="sm" onClick={() => markStatus(entry.queueEntryId, "in_service")} loading={pendingId === entry.queueEntryId}>
                Start service
              </Button>
            )}
            {entry.status === "in_service" && (
              <Button size="sm" onClick={() => markStatus(entry.queueEntryId, "completed")} loading={pendingId === entry.queueEntryId}>
                Mark completed
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setPendingId(entry.queueEntryId);
                await markNoShow(entry.appointmentId);
                await updateQueueStatus(entry.queueEntryId, "cancelled");
                setPendingId(null);
                router.refresh();
              }}
              loading={pendingId === entry.queueEntryId}
            >
              No-show
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
