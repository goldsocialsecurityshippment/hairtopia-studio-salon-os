import { getClientForViewer } from "@/lib/actions/crm";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ClientIntakeForm } from "./ClientIntakeForm";
import { ClientPhotoUpload } from "./ClientPhotoUpload";

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentUser();
  if (!session) redirect(`/login?next=/admin/clients/${id}`);

  const data = await getClientForViewer(id);
  if (!data) {
    // Either the client doesn't exist, or (more likely for a stylist) this
    // session simply isn't authorized to view them — never leak which.
    notFound();
  }

  const { client, visits, photos, appointments, scope } = data;

  return (
    <div>
      <Link href="/admin/clients" className="text-sm text-ink-soft hover:text-ink">← Back to clients</Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">{client.fullName ?? "Client"}</h1>
        <span className="rounded-full bg-bronze-100 px-2.5 py-1 text-xs font-medium text-bronze-600 capitalize">
          {scope} access
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {client.phone} {client.email ? `· ${client.email}` : ""} {client.whatsapp ? `· WA: ${client.whatsapp}` : ""}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ClientIntakeForm clientId={id} client={client} scope={scope} />

          <Card className="p-5">
            <p className="font-display text-lg text-ink">Visit history</p>
            <div className="mt-3 space-y-3">
              {visits.length === 0 && <p className="text-sm text-ink-soft">No visit notes recorded yet.</p>}
              {visits.map((v) => (
                <div key={v.id} className="rounded-sm border border-line p-3 text-sm">
                  <p className="font-medium text-ink">{v.visitDate}</p>
                  {v.hairConditionObserved && <p className="text-ink-soft">Condition: {v.hairConditionObserved}</p>}
                  {v.productsUsed && <p className="text-ink-soft">Products: {v.productsUsed}</p>}
                  {v.outcome && <p className="text-ink-soft">Outcome: {v.outcome}</p>}
                  {v.notes && <p className="text-ink-soft">{v.notes}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="font-display text-lg text-ink">Appointments</p>
            <p className="mt-1 text-xs text-ink-soft">{appointments.length} total (this client, not a client count)</p>
            <div className="mt-3 space-y-2">
              {appointments.slice(0, 8).map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/appointments/${a.id}`}
                  className="block rounded-sm border border-line p-2.5 text-xs hover:border-ink/30"
                >
                  <span className="font-medium text-ink">{a.scheduledDate}</span>{" "}
                  <span className="text-ink-soft">{a.scheduledTime} · {a.status}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="font-display text-lg text-ink">Photos</p>
            <p className="mt-1 text-xs text-ink-soft">
              {photos.length === 0 ? "No photos on file for your access level." : `${photos.length} photo(s) visible to you.`}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={p.photoType} className="aspect-square rounded-sm object-cover" />
              ))}
            </div>
            {(scope === "full" || scope === "assigned") && <ClientPhotoUpload clientId={id} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
