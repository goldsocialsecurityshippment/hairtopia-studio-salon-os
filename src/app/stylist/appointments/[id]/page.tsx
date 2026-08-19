import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { appointments, services, serviceVariations, customerReferences, completedWork } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { StylistAppointmentCard } from "@/components/stylist/StylistAppointmentCard";

export default async function StylistAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/stylist/appointments/${id}`);

  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!appointment) notFound();
  if (user.role === "stylist" && appointment.stylistId !== user.id) notFound();

  const [service] = await db.select().from(services).where(eq(services.id, appointment.serviceId));
  const variation = appointment.variationId
    ? (await db.select().from(serviceVariations).where(eq(serviceVariations.id, appointment.variationId)))[0]
    : null;
  const references = await db.select().from(customerReferences).where(eq(customerReferences.appointmentId, id));
  const work = await db.select().from(completedWork).where(eq(completedWork.appointmentId, id));

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/stylist" className="text-sm text-ink-soft hover:text-ink">
        ← Back to today
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl text-ink">{appointment.customerName}</h1>
          <p className="text-sm text-ink-soft">
            {appointment.customerPhone} · {service?.name}
            {variation ? ` — ${variation.label}` : ""}
          </p>
        </div>
        <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
      </div>

      <p className="mt-2 text-sm text-ink-soft">{appointment.scheduledDate} at {appointment.scheduledTime}</p>

      {appointment.instructions && (
        <div className="mt-4 rounded-card border border-line bg-bronze-50 p-4">
          <p className="text-xs uppercase tracking-wide2 text-bronze-600">Customer request</p>
          <p className="mt-1 text-sm text-ink">{appointment.instructions}</p>
        </div>
      )}

      {references.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Reference material</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {references.map((r) =>
              r.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={r.id} src={r.url} alt="Reference" className="h-28 w-28 rounded-card object-cover" />
              ) : (
                <video key={r.id} src={r.url} controls className="h-28 w-28 rounded-card object-cover" />
              )
            )}
          </div>
        </div>
      )}

      {work.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Completed work</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {work.map((w) => (
              <div key={w.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.photoUrl} alt="Completed work" className="h-28 w-28 rounded-card object-cover" />
                <Badge tone={statusTone(w.reviewStatus)}>{statusLabel(w.reviewStatus)}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <StylistAppointmentCard
          appt={{
            id: appointment.id,
            customerName: appointment.customerName,
            customerPhone: appointment.customerPhone,
            scheduledTime: appointment.scheduledTime,
            status: appointment.status,
            instructions: null,
            serviceName: service?.name ?? "",
            customerArrivedAt: appointment.customerArrivedAt,
            priceEstimate: appointment.priceEstimate,
            paymentStatus: appointment.paymentStatus,
          }}
        />
      </div>
    </div>
  );
}
