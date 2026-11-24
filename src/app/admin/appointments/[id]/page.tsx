import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import {
  appointments,
  users,
  customerReferences,
  completedWork,
  appointmentStatusHistory,
  payments,
  reviews,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { PaymentForm } from "./PaymentForm";
import { BeforeAfterPanel } from "./BeforeAfterPanel";
import { FinalPriceForm } from "./FinalPriceForm";
import { getAppointmentServiceLines } from "@/lib/data/appointment-services";

export default async function AdminAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || (user.role !== "manager" && user.role !== "owner" && user.role !== "admin")) redirect("/login?next=/admin/appointments");

  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!appointment) notFound();

  const serviceLines = await getAppointmentServiceLines(appointment);
  const minimumPrice = serviceLines.reduce((total, line) => total + line.minPrice, 0);
  const maximumPrice = serviceLines.reduce((total, line) => total + line.maxPrice, 0);
  const hasPriceRange = serviceLines.some((line) => line.hasPriceRange);
  const stylist = appointment.stylistId
    ? (await db.select().from(users).where(eq(users.id, appointment.stylistId)))[0]
    : null;
  const references = await db.select().from(customerReferences).where(eq(customerReferences.appointmentId, id));
  const workItems = await db.select().from(completedWork).where(eq(completedWork.appointmentId, id));
  const history = await db
    .select()
    .from(appointmentStatusHistory)
    .where(eq(appointmentStatusHistory.appointmentId, id))
    .orderBy(asc(appointmentStatusHistory.timestamp));
  const paymentHistory = await db.select().from(payments).where(eq(payments.appointmentId, id));
  const [review] = await db.select().from(reviews).where(eq(reviews.appointmentId, id));

  return (
    <div className="max-w-4xl">
      <Link href="/admin/appointments" className="text-sm text-ink-soft hover:text-ink">
        ← Back to appointments
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">{appointment.customerName}</h1>
          <p className="text-sm text-ink-soft">
            {appointment.customerPhone} · {serviceLines.map((line) => line.serviceName).join(" + ")}
          </p>
        </div>
        <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">When</p>
          <p className="mt-1 text-sm text-ink">{appointment.scheduledDate} at {appointment.scheduledTime}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Stylist</p>
          <p className="mt-1 text-sm text-ink">{stylist?.name ?? "Unassigned"}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Estimated price</p>
          <p className="mt-1 text-sm text-ink">GH₵{appointment.priceEstimate}</p>
          {hasPriceRange && (
            <FinalPriceForm
              appointmentId={appointment.id}
              currentPrice={appointment.priceEstimate}
              priceMin={minimumPrice}
              priceMax={maximumPrice}
            />
          )}
        </div>
      </div>

      {serviceLines.some((line) => line.acceptedTermsId) && (
        <div className="mt-4 rounded-card border border-bronze-200 bg-bronze-50/50 p-4">
          <p className="text-xs uppercase tracking-wide2 text-bronze-600">Terms accepted</p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {serviceLines.filter((line) => line.acceptedTermsId).map((line) => (
              <li key={line.id}>{line.serviceName}: version {line.acceptedTermsVersion} accepted at {line.acceptedTermsAt ? new Date(line.acceptedTermsAt).toLocaleString() : "—"}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-card border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wide2 text-ink-soft">Services in this appointment</p>
        <ul className="mt-2 space-y-2">
          {serviceLines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 text-sm">
              <span className="text-ink">{line.serviceName}{line.variationLabel ? ` — ${line.variationLabel}` : ""}</span>
              <span className="shrink-0 text-ink-soft">GH₵{line.price} · {line.durationMinutes} min</span>
            </li>
          ))}
        </ul>
      </div>

      {appointment.instructions && (
        <div className="mt-4 rounded-card border border-line bg-bronze-50 p-4">
          <p className="text-xs uppercase tracking-wide2 text-bronze-600">Customer instructions</p>
          <p className="mt-1 text-sm text-ink">{appointment.instructions}</p>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 font-display text-lg text-ink">Before &amp; after</p>
        <BeforeAfterPanel
          references={references.map((r) => ({ id: r.id, url: r.url, type: r.type }))}
          workItems={workItems.map((w) => ({
            id: w.id,
            photoUrl: w.photoUrl,
            mediaType: w.mediaType,
            reviewStatus: w.reviewStatus,
            uploadedAt: w.uploadedAt,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <PaymentForm
          appointmentId={appointment.id}
          priceEstimate={appointment.priceEstimate}
          currentStatus={appointment.paymentStatus}
          history={paymentHistory.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            status: p.status,
            timestamp: p.timestamp,
            note: p.note,
          }))}
        />

        <div className="rounded-card border border-line bg-surface p-5">
          <p className="font-display text-lg text-ink">Customer review</p>
          {review ? (
            <div className="mt-3">
              <p className="text-sm text-ink">★ {review.overallRating}/5</p>
              {review.comment && <p className="mt-1 text-sm text-ink-soft">&ldquo;{review.comment}&rdquo;</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              {appointment.status === "completed"
                ? "The customer hasn't left a review yet."
                : "A review can be left once the service is completed."}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-3 text-xs uppercase tracking-wide2 text-ink-soft">Appointment timeline</p>
        <ol className="space-y-3 border-l border-line pl-5">
          {history.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute -left-[25px] top-1 h-2 w-2 rounded-full bg-bronze-400" />
              <span className="text-ink">{statusLabel(h.status)}</span>
              <span className="ml-2 text-xs text-ink-soft">{new Date(h.timestamp).toLocaleString()}</span>
              {h.note && <p className="text-xs text-ink-soft">{h.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
