import { searchClients, countUniqueClients } from "@/lib/actions/crm";
import { ClientSearch } from "./ClientSearch";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [results, uniqueCount] = await Promise.all([searchClients(q ?? ""), countUniqueClients()]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Clients</h1>
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{uniqueCount}</span> unique clients on file
        </p>
      </div>
      <p className="mt-1 max-w-xl text-sm text-ink-soft">
        This is the central client record — the same person is matched here whether they booked online
        or walked in, by phone number. &quot;Appointments&quot; below counts visits, not separate clients.
      </p>

      <div className="mt-6">
        <ClientSearch initialQuery={q ?? ""} initialResults={results} />
      </div>
    </div>
  );
}
