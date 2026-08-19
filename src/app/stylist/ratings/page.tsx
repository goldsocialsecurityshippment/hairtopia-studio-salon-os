import { getCurrentUser } from "@/lib/actions/auth";
import { db } from "@/db";
import { reviews, appointments, services } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function StylistRatingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await db
    .select({ review: reviews, appointment: appointments, serviceName: services.name })
    .from(reviews)
    .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(eq(appointments.stylistId, user.id))
    .orderBy(desc(reviews.createdAt));

  const visible = rows.filter((r) => !r.review.hidden);
  const avgOverall = visible.length
    ? visible.reduce((sum, r) => sum + r.review.overallRating, 0) / visible.length
    : null;

  const categoryAverages = [
    { key: "qualityRating" as const, label: "Service quality" },
    { key: "professionalismRating" as const, label: "Professionalism" },
    { key: "communicationRating" as const, label: "Communication" },
    { key: "respectfulnessRating" as const, label: "Respectfulness" },
    { key: "punctualityRating" as const, label: "Punctuality" },
  ].map((c) => {
    const rated = visible.filter((r) => r.review[c.key] != null);
    const avg = rated.length
      ? rated.reduce((sum, r) => sum + (r.review[c.key] ?? 0), 0) / rated.length
      : null;
    return { ...c, avg };
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-xl text-ink">Your ratings</h1>

      <div className="mt-4 rounded-card border border-line bg-surface p-5 text-center">
        <p className="font-display text-4xl text-ink">{avgOverall ? avgOverall.toFixed(1) : "—"}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {visible.length > 0 ? `Based on ${visible.length} review${visible.length === 1 ? "" : "s"}` : "No reviews yet"}
        </p>
      </div>

      {visible.length > 0 && (
        <div className="mt-4 space-y-2">
          {categoryAverages.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-2.5 text-sm">
              <span className="text-ink-soft">{c.label}</span>
              <span className="text-ink">{c.avg ? `★ ${c.avg.toFixed(1)}` : "—"}</span>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg text-ink">Recent reviews</h2>
      {visible.length === 0 ? (
        <EmptyState title="No reviews yet" description="Reviews from your customers will show up here." />
      ) : (
        <div className="space-y-3">
          {visible.map(({ review, serviceName }) => (
            <div key={review.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">★ {review.overallRating}/5</span>
                <span className="text-xs text-ink-soft">{serviceName}</span>
              </div>
              {review.comment && <p className="mt-2 text-sm text-ink-soft">&ldquo;{review.comment}&rdquo;</p>}
              <p className="mt-2 text-xs text-ink-soft/70">{new Date(review.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
