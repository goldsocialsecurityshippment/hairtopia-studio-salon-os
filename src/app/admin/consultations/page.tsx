import { listConsultations } from "@/lib/actions/consultations";
import { getCategoriesWithServices } from "@/lib/data/queries";
import { ConsultationCard } from "./ConsultationCard";

export default async function AdminConsultationsPage() {
  const [consultations, categories] = await Promise.all([listConsultations(), getCategoriesWithServices()]);
  const services = categories.flatMap((c) => c.services.map((s) => ({ id: s.id, name: s.name, categoryName: c.name })));

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Discovery consultations</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Review requests, send a recommendation, then convert accepted ones directly into a booking.
      </p>

      <div className="mt-6 space-y-4">
        {consultations.length === 0 && <p className="text-sm text-ink-soft">No consultation requests yet.</p>}
        {consultations.map((c) => (
          <ConsultationCard key={c.id} consultation={c} services={services} />
        ))}
      </div>
    </div>
  );
}
