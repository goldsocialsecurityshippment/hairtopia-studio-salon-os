import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/actions/auth";
import { db } from "@/db";
import { appointments, services, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Badge, statusTone, statusLabel } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PushToggle } from "@/components/PushToggle";
import { NotificationPreferences } from "@/components/NotificationPreferences";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "customer") redirect("/login?next=/account");

  const myAppointments = await db
    .select({
      appointment: appointments,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(eq(appointments.customerId, user.id))
    .orderBy(desc(appointments.createdAt));

  const stylistIds = Array.from(new Set(myAppointments.map((a) => a.appointment.stylistId).filter(Boolean))) as string[];
  const stylists = stylistIds.length
    ? await db.select().from(users).where(eq(users.role, "stylist"))
    : [];

  const upcoming = myAppointments.filter((a) =>
    ["pending", "confirmed", "arrived", "in_service"].includes(a.appointment.status)
  );
  const past = myAppointments.filter((a) =>
    ["completed", "cancelled", "no_show"].includes(a.appointment.status)
  );

  return (
    <>
      <SiteHeader />
      <main className="container-page py-12">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide2 text-bronze-500">My account</p>
            <h1 className="mt-2 font-display text-3xl text-ink">Hello, {user.name.split(" ")[0]}</h1>
            <div className="mt-3">
              <PushToggle />
              <NotificationPreferences
                userId={user.id}
                relevantKeys={["bookingEvents", "reminderEvents", "paymentEvents", "consultationEvents", "cancellationEvents"]}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/book">
              <Button size="sm">Book again</Button>
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl text-ink">Upcoming</h2>
          {upcoming.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Your schedule is clear."
                description="You don't have any upcoming appointments."
                action={
                  <Link href="/book">
                    <Button size="sm">Book an appointment</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {upcoming.map(({ appointment, serviceName }) => {
                const stylist = stylists.find((s) => s.id === appointment.stylistId);
                return (
                  <Link
                    key={appointment.id}
                    href={`/account/appointments/${appointment.id}`}
                    className="flex items-center justify-between rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink/30"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{serviceName}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {appointment.scheduledDate} at {appointment.scheduledTime}
                        {stylist ? ` · with ${stylist.name}` : ""}
                      </p>
                    </div>
                    <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl text-ink">Past appointments</h2>
          {past.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">No past appointments yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {past.map(({ appointment, serviceName }) => (
                <Link
                  key={appointment.id}
                  href={`/account/appointments/${appointment.id}`}
                  className="flex items-center justify-between rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink/30"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{serviceName}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {appointment.scheduledDate} at {appointment.scheduledTime}
                    </p>
                  </div>
                  <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
