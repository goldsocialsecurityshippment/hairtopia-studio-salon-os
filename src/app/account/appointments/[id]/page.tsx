import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import {
  appointments,
  services,
  serviceVariations,
  users,
  customerReferences,
  appointmentStatusHistory,
  reviews,
  completedWork,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { ArriveButton } from "./ArriveButton";
import { CancelDialog } from "./CancelDialog";
import { ReviewForm } from "./ReviewForm";
import { ReviewDisplay } from "./ReviewDisplay";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/account/appointments/${id}`);

  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!appointment) notFound();
  if (user.role === "customer" && appointment.customerId !== user.id) notFound();

  const [service] = await db.select().from(services).where(eq(services.id, appointment.serviceId));
  const variation = appointment.variationId
    ? (await db.select().from(serviceVariations).where(eq(serviceVariations.id, appointment.variationId)))[0]
    : null;
  const stylist = appointment.stylistId
    ? (await db.select().from(users).where(eq(users.id, appointment.stylistId)))[0]
    : null;
  const references = await db.select().from(customerReferences).where(eq(customerReferences.appointmentId, id));
  const history = await db
    .select()
    .from(appointmentStatusHistory)
    .where(eq(appointmentStatusHistory.appointmentId, id))
    .orderBy(asc(appointmentStatusHistory.timestamp));
  const [existingReview] = await db.select().from(reviews).where(eq(reviews.appointmentId, id));
  const work = await db.select().from(completedWork).where(eq(completedWork.appointmentId, id));

  const canArrive = user.role === "customer" && !appointment.customerArrivedAt && ["confirmed", "pending"].includes(appointment.status);
  const canCancel = user.role === "customer" && ["pending", "confirmed"].includes(appointment.status);
  const canReview = user.role === "customer" && appointment.status === "completed" && !existingReview;

  return (
    <>
      <SiteHeader />
      <main className="container-page max-w-2xl py-12">
        <Link href="/account" className="text-sm text-ink-soft hover:text-ink">
          ← Back to my account
        </Link>

        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl text-ink">{service?.name}</h1>
            {variation && <p className="text-sm text-ink-soft">{variation.label}</p>}
          </div>
          <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide2 text-ink-soft">When</p>
            <p className="mt-1 text-sm text-ink">{appointment.scheduledDate} at {appointment.scheduledTime}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide2 text-ink-soft">Stylist</p>
            <p className="mt-1 text-sm text-ink">{stylist?.name ?? "To be assigned"}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide2 text-ink-soft">Estimated price</p>
            <p className="mt-1 text-sm text-ink">GH₵{appointment.priceEstimate}</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide2 text-ink-soft">Payment</p>
            <p className="mt-1 text-sm text-ink">{statusLabel(appointment.paymentStatus)}</p>
          </div>
        </div>

        {appointment.instructions && (
          <div className="mt-4 rounded-card border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide2 text-ink-soft">Your instructions</p>
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
                  <img key={r.id} src={r.url} alt="Reference" className="h-24 w-24 rounded-card object-cover" />
                ) : (
                  <video key={r.id} src={r.url} controls className="h-24 w-24 rounded-card object-cover" />
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
                // eslint-disable-next-line @next/next/no-img-element
                <img key={w.id} src={w.photoUrl} alt="Completed work" className="h-24 w-24 rounded-card object-cover" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {canArrive && <ArriveButton appointmentId={appointment.id} />}
          {canCancel && <CancelDialog appointmentId={appointment.id} />}
        </div>

        {canReview && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-ink">How was your visit?</p>
            <ReviewForm appointmentId={appointment.id} />
          </div>
        )}

        {existingReview && (
          <ReviewDisplay
            appointmentId={appointment.id}
            review={{
              id: existingReview.id,
              overallRating: existingReview.overallRating,
              qualityRating: existingReview.qualityRating,
              professionalismRating: existingReview.professionalismRating,
              communicationRating: existingReview.communicationRating,
              respectfulnessRating: existingReview.respectfulnessRating,
              punctualityRating: existingReview.punctualityRating,
              comment: existingReview.comment,
            }}
          />
        )}

        <div className="mt-10">
          <p className="text-xs uppercase tracking-wide2 text-ink-soft">Appointment timeline</p>
          <ol className="mt-3 space-y-3 border-l border-line pl-5">
            {history.map((h) => (
              <li key={h.id} className="relative text-sm">
                <span className="absolute -left-[25px] top-1 h-2 w-2 rounded-full bg-bronze-400" />
                <span className="text-ink">{statusLabel(h.status)}</span>
                <span className="ml-2 text-xs text-ink-soft">
                  {new Date(h.timestamp).toLocaleString()}
                </span>
                {h.note && <p className="text-xs text-ink-soft">{h.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
