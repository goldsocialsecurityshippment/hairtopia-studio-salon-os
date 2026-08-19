import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCategoriesWithServices, getActiveStylists } from "@/lib/data/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { BookingWizard } from "./BookingWizard";

export default async function BookPage() {
  const [categories, stylists, user] = await Promise.all([
    getCategoriesWithServices(),
    getActiveStylists(),
    getCurrentUser(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-16">
        <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Booking</p>
        <h1 className="mt-2 font-display text-3xl text-ink">Book your appointment</h1>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          Prices shown are estimates and may change based on your hair length, condition and chosen style.
        </p>

        <div className="mt-10">
          <BookingWizard
            categories={categories}
            stylists={stylists.map((s) => ({
              id: s.id,
              name: s.name,
              serviceIds: s.serviceIds,
              avgRating: s.avgRating,
              reviewCount: s.reviewCount,
              specialties: s.profile?.specialties ?? null,
            }))}
            defaultName={user?.role === "customer" ? user.name : ""}
            defaultPhone={user?.role === "customer" ? user.phone ?? "" : ""}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
