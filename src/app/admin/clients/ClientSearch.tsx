"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { searchClients } from "@/lib/actions/crm";

type ClientRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  appointmentCount: number;
  lastVisitDate: string | null;
};

export function ClientSearch({
  initialQuery,
  initialResults,
}: {
  initialQuery: string;
  initialResults: ClientRow[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    setQuery(value);
    startTransition(async () => {
      const r = await searchClients(value);
      setResults(r);
    });
  }

  return (
    <div>
      <Input
        placeholder="Search by name, phone, WhatsApp or email…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Appointments</th>
              <th className="px-4 py-3">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-bronze-50/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-medium text-ink hover:underline">
                    {c.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">{c.phone}{c.email ? ` · ${c.email}` : ""}</td>
                <td className="px-4 py-3 text-ink-soft">{c.appointmentCount}</td>
                <td className="px-4 py-3 text-ink-soft">{c.lastVisitDate ?? "—"}</td>
              </tr>
            ))}
            {results.length === 0 && !isPending && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
