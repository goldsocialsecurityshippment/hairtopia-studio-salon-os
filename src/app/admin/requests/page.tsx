import { db } from "@/db";
import { appointments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listRescheduleRequests } from "@/lib/actions/reschedule";
import { RequestsPanel } from "./RequestsPanel";

export default async function AdminRequestsPage() {
  const [pendingCancellations, pendingReschedules] = await Promise.all([
    db.select().from(appointments).where(eq(appointments.cancellationRequestStatus, "requested")),
    listRescheduleRequests("pending"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Pending requests</h1>
      <p className="mt-1 max-w-lg text-sm text-ink-soft">
        Cancellation and reschedule requests a customer made inside the salon&apos;s policy window — every
        one of these needs a staff decision before anything changes.
      </p>
      <div className="mt-6">
        <RequestsPanel cancellations={pendingCancellations} reschedules={pendingReschedules} />
      </div>
    </div>
  );
}
