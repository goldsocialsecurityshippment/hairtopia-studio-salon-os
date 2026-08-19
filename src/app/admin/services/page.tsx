import { getCategoriesWithServices } from "@/lib/data/queries";
import { ServiceManager } from "./ServiceManager";

export default async function AdminServicesPage() {
  const categories = await getCategoriesWithServices();

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Services & pricing</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Manage categories, services, prices and variations. Changes apply immediately to the booking flow.
      </p>
      <div className="mt-6">
        <ServiceManager categories={categories} />
      </div>
    </div>
  );
}
