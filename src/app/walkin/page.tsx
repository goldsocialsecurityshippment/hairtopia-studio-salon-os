import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCategoriesWithServices, getActiveStylists } from "@/lib/data/queries";
import { WalkInForm } from "./WalkInForm";

export const dynamic = "force-dynamic";

export default async function WalkInPage() {
  const [categories, stylists] = await Promise.all([getCategoriesWithServices(), getActiveStylists()]);

  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-16">
        <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">Walk-in</p>
        <h1 className="mt-2 font-display text-3xl text-ink">I&apos;m here</h1>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          Choose your service, add yourself to the queue, and a team member will call you when it&apos;s your turn.
        </p>
        <div className="mt-10 max-w-md">
          <WalkInForm
            categories={categories}
            stylists={stylists.map((s) => ({ id: s.id, name: s.name, serviceIds: s.serviceIds }))}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
