import { db } from "@/db";
import { queueEntries, appointments, services, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueueBoard } from "./QueueBoard";

export default async function AdminQueuePage() {
  const rows = await db
    .select({
      queueEntry: queueEntries,
      appointment: appointments,
      serviceName: services.name,
    })
    .from(queueEntries)
    .innerJoin(appointments, eq(queueEntries.appointmentId, appointments.id))
    .innerJoin(services, eq(appointments.serviceId, services.id));

  const stylists = await db.select().from(users).where(eq(users.role, "stylist"));

  const active = rows
    .filter((r) => ["waiting", "called", "in_service"].includes(r.queueEntry.status))
    .sort((a, b) => a.queueEntry.position - b.queueEntry.position);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Walk-in queue</h1>
      <p className="mt-1 text-sm text-ink-soft">Customers who joined via reception or QR check-in.</p>

      {active.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="The queue is empty" description="Walk-ins will appear here as customers check in." />
        </div>
      ) : (
        <div className="mt-6">
          <QueueBoard
            entries={active.map((r) => ({
              queueEntryId: r.queueEntry.id,
              appointmentId: r.appointment.id,
              status: r.queueEntry.status,
              customerName: r.appointment.customerName,
              serviceName: r.serviceName,
              stylistId: r.appointment.stylistId,
              joinedAt: r.queueEntry.joinedAt,
            }))}
            stylists={stylists.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      )}
    </div>
  );
}
