import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCurrentUser } from "@/lib/actions/auth";
import { getActiveStylists } from "@/lib/data/queries";
import { ConsultationForm } from "./ConsultationForm";

export default async function ConsultPage() {
  const [user, stylists] = await Promise.all([getCurrentUser(), getActiveStylists()]);

  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-16">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Discovery Consultation</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Not sure what your hair needs?</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Tell us about your hair and what you&apos;re hoping for. A stylist will review it and recommend a
            service, price and duration before you book anything.
          </p>

          <div className="mt-8">
            <ConsultationForm
              stylists={stylists.map((s) => ({ id: s.id, name: s.name }))}
              defaultName={user?.role === "customer" ? user.name : ""}
              defaultPhone={user?.role === "customer" ? user.phone ?? "" : ""}
            />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
