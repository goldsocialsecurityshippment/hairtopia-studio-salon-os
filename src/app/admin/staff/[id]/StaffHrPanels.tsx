"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  addStaffContract,
  setContractStatus,
  issueStaffWarning,
  recordStaffNoShow,
  setNoShowStatus,
  recordStaffAdvanceEntry,
  issueUniform,
  returnUniform,
} from "@/lib/actions/staff-hr";

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="font-display text-lg text-ink">{title}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}

/** ---------------- CONTRACTS ---------------- */
export function ContractsPanel({
  staffId,
  contracts,
}: {
  staffId: string;
  contracts: { id: string; title: string; contractType: string; startDate: string; endDate: string | null; status: string; acknowledgedAt: string | null }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState("Full-time");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [terms, setTerms] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await addStaffContract({ staffId, title, contractType, startDate, terms: terms || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setTitle("");
    setTerms("");
    router.refresh();
  }

  return (
    <SectionShell title="Contracts">
      {contracts.length === 0 && <p className="text-sm text-ink-soft">No contracts on file.</p>}
      {contracts.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-sm border border-line p-3 text-sm">
          <div>
            <p className="font-medium text-ink">{c.title} · {c.contractType}</p>
            <p className="text-xs text-ink-soft">
              From {c.startDate}{c.endDate ? ` to ${c.endDate}` : ""} · {c.status}
              {c.acknowledgedAt ? " · acknowledged" : " · not yet acknowledged"}
            </p>
          </div>
          {c.status === "active" && (
            <Button size="sm" variant="secondary" onClick={async () => { await setContractStatus(c.id, "ended"); router.refresh(); }}>
              End contract
            </Button>
          )}
        </div>
      ))}
      <div className="border-t border-line pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select label="Type" value={contractType} onChange={(e) => setContractType(e.target.value)}>
            <option>Full-time</option>
            <option>Part-time</option>
            <option>Contractor</option>
            <option>Apprentice</option>
          </Select>
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <Textarea label="Terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} className="mt-2" />
        {error && <p className="mt-2 text-xs text-rust">{error}</p>}
        <Button size="sm" className="mt-2" loading={pending} disabled={!title} onClick={submit}>
          Add contract
        </Button>
      </div>
    </SectionShell>
  );
}

/** ---------------- WARNINGS ---------------- */
export function WarningsPanel({
  staffId,
  warnings,
}: {
  staffId: string;
  warnings: { id: string; level: string; reason: string; issuedAt: string; acknowledgedAt: string | null }[];
}) {
  const router = useRouter();
  const [level, setLevel] = useState<"verbal" | "written" | "final" | "termination">("verbal");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await issueStaffWarning({ staffId, level, reason, details: details || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setReason("");
    setDetails("");
    router.refresh();
  }

  return (
    <SectionShell title="Disciplinary warnings">
      {warnings.length === 0 && <p className="text-sm text-ink-soft">No warnings on file.</p>}
      {warnings.map((w) => (
        <div key={w.id} className="rounded-sm border border-line p-3 text-sm">
          <p className="font-medium text-ink capitalize">{w.level} warning — {new Date(w.issuedAt).toLocaleDateString()}</p>
          <p className="text-ink-soft">{w.reason}</p>
          <p className="mt-1 text-xs text-ink-soft">{w.acknowledgedAt ? "Acknowledged by staff" : "Not yet acknowledged"}</p>
        </div>
      ))}
      <div className="border-t border-line pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="verbal">Verbal</option>
            <option value="written">Written</option>
            <option value="final">Final</option>
            <option value="termination">Termination</option>
          </Select>
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Textarea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} className="mt-2" />
        {error && <p className="mt-2 text-xs text-rust">{error}</p>}
        <Button size="sm" variant="danger" className="mt-2" loading={pending} disabled={!reason} onClick={submit}>
          Issue warning
        </Button>
      </div>
    </SectionShell>
  );
}

/** ---------------- NO-SHOWS ---------------- */
export function NoShowsPanel({
  staffId,
  noShows,
}: {
  staffId: string;
  noShows: { id: string; scheduledDate: string; reason: string | null; status: string }[];
}) {
  const router = useRouter();
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    await recordStaffNoShow({ staffId, scheduledDate, reason: reason || undefined });
    setPending(false);
    setReason("");
    router.refresh();
  }

  return (
    <SectionShell title="Staff no-shows">
      {noShows.length === 0 && <p className="text-sm text-ink-soft">No recorded no-shows.</p>}
      {noShows.map((n) => (
        <div key={n.id} className="flex items-center justify-between rounded-sm border border-line p-3 text-sm">
          <div>
            <p className="font-medium text-ink">{n.scheduledDate}</p>
            <p className="text-xs text-ink-soft">{n.reason ?? "No reason given"} · {n.status}</p>
          </div>
          {n.status === "under_review" && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={async () => { await setNoShowStatus(n.id, "excused"); router.refresh(); }}>Excuse</Button>
              <Button size="sm" variant="danger" onClick={async () => { await setNoShowStatus(n.id, "unexcused"); router.refresh(); }}>Unexcused</Button>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <Input label="Date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" loading={pending} onClick={submit}>Record no-show</Button>
      </div>
    </SectionShell>
  );
}

/** ---------------- ADVANCES / DEBT ---------------- */
export function AdvancesPanel({
  staffId,
  entries,
}: {
  staffId: string;
  entries: { id: string; entryType: string; amount: number; balanceAfter: number; reason: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [entryType, setEntryType] = useState<"advance" | "deduction" | "repayment" | "no_show_debit">("advance");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const currentBalance = entries[0]?.balanceAfter ?? 0;

  async function submit() {
    setPending(true);
    await recordStaffAdvanceEntry({ staffId, entryType, amount, reason: reason || undefined });
    setPending(false);
    setAmount(0);
    setReason("");
    router.refresh();
  }

  return (
    <SectionShell title="Advances & debt">
      <p className="text-sm">
        Current balance owed: <span className="font-display text-lg text-ink">GH₵{currentBalance.toFixed(2)}</span>
      </p>
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-sm border border-line p-2.5 text-sm">
            <span className="capitalize text-ink-soft">{e.entryType.replace("_", " ")} — {e.reason ?? "—"}</span>
            <span className="font-medium text-ink">GH₵{e.amount} (bal. GH₵{e.balanceAfter.toFixed(2)})</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <Select label="Type" value={entryType} onChange={(e) => setEntryType(e.target.value as typeof entryType)}>
          <option value="advance">Advance</option>
          <option value="deduction">Deduction</option>
          <option value="repayment">Repayment</option>
          <option value="no_show_debit">No-show debit</option>
        </Select>
        <Input label="Amount (GH₵)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-32" />
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" loading={pending} disabled={amount <= 0} onClick={submit}>Record</Button>
      </div>
    </SectionShell>
  );
}

/** ---------------- UNIFORMS ---------------- */
export function UniformsPanel({
  staffId,
  issues,
}: {
  staffId: string;
  issues: { id: string; item: string; size: string | null; quantity: number; issueDate: string; status: string }[];
}) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [size, setSize] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    await issueUniform({ staffId, item, size: size || undefined, quantity: 1, issueDate: new Date().toISOString().slice(0, 10) });
    setPending(false);
    setItem("");
    setSize("");
    router.refresh();
  }

  return (
    <SectionShell title="Uniforms & scrubs">
      {issues.length === 0 && <p className="text-sm text-ink-soft">No items issued.</p>}
      {issues.map((u) => (
        <div key={u.id} className="flex items-center justify-between rounded-sm border border-line p-2.5 text-sm">
          <span>{u.item} {u.size ? `(${u.size})` : ""} × {u.quantity} — {u.status}</span>
          {u.status === "issued" && (
            <Button size="sm" variant="secondary" onClick={async () => { await returnUniform(u.id, "good"); router.refresh(); }}>
              Mark returned
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <Input label="Item" value={item} onChange={(e) => setItem(e.target.value)} />
        <Input label="Size (optional)" value={size} onChange={(e) => setSize(e.target.value)} className="w-24" />
        <Button size="sm" loading={pending} disabled={!item} onClick={submit}>Issue</Button>
      </div>
    </SectionShell>
  );
}
