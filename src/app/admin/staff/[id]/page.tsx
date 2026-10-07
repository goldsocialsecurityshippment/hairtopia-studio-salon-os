import { db } from "@/db";
import { users, staffProfiles, stylistServices, serviceCategories, services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  listStaffContracts,
  listStaffWarnings,
  listStaffNoShows,
  listStaffAdvances,
  listUniformIssues,
} from "@/lib/actions/staff-hr";
import { ContractsPanel, WarningsPanel, NoShowsPanel, AdvancesPanel, UniformsPanel } from "./StaffHrPanels";
import { ProfessionalProfilePanel } from "./ProfessionalProfilePanel";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentUser();
  if (!session || (session.role !== "owner" && session.role !== "admin" && session.role !== "manager")) {
    redirect("/login?next=/admin/staff");
  }

  const [staff] = await db.select().from(users).where(eq(users.id, id));
  if (!staff) notFound();
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, id));

  const [contracts, warnings, noShows, advances, uniforms] = await Promise.all([
    listStaffContracts(id),
    listStaffWarnings(id),
    listStaffNoShows(id),
    listStaffAdvances(id),
    listUniformIssues(id),
  ]);

  // Only meaningful for stylists (the professionals who actually perform
  // services) — managers/owners don't get a service-eligibility panel.
  let allCategories: { id: string; name: string; services: { id: string; name: string }[] }[] = [];
  let assignedServiceIds: string[] = [];
  if (staff.role === "stylist") {
    const [cats, allServices, links] = await Promise.all([
      db.select().from(serviceCategories),
      db.select().from(services),
      db.select().from(stylistServices).where(eq(stylistServices.stylistId, id)),
    ]);
    allCategories = cats
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        services: allServices.filter((s) => s.categoryId === c.id && s.active).map((s) => ({ id: s.id, name: s.name })),
      }));
    assignedServiceIds = links.map((l) => l.serviceId);
  }

  return (
    <div>
      <Link href="/admin/staff" className="text-sm text-ink-soft hover:text-ink">← Back to staff</Link>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">{staff.name}</h1>
          <p className="text-sm text-ink-soft capitalize">
            {staff.role} {profile ? `· ${profile.category.replace("_", " ")}` : ""}
          </p>
        </div>
      </div>

      {staff.role === "stylist" && (
        <div className="mt-6">
          <ProfessionalProfilePanel
            staffId={id}
            currentCategory={profile?.category ?? "hair_stylist"}
            categories={allCategories}
            assignedServiceIds={assignedServiceIds}
          />
        </div>
      )}

      <p className="mt-6 max-w-2xl rounded-sm border border-line bg-bronze-50/50 p-3 text-xs text-ink-soft">
        HR records below (contracts, warnings, no-shows, advances, uniforms) are visible only to
        Owner, Trusted Admin, and Manager — never to other stylists — and every change here is written
        to the audit log.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ContractsPanel staffId={id} contracts={contracts} />
        <WarningsPanel staffId={id} warnings={warnings} />
        <NoShowsPanel staffId={id} noShows={noShows} />
        <AdvancesPanel staffId={id} entries={advances} />
        <div className="lg:col-span-2">
          <UniformsPanel staffId={id} issues={uniforms} />
        </div>
      </div>
    </div>
  );
}
