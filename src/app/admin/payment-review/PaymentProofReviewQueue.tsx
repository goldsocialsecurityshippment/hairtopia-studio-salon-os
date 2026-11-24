"use client";

import { useState } from "react";
import { reviewMobileMoneyProof } from "@/lib/actions/payment-proofs";

type Proof = {
  id: string;
  appointmentId: string;
  amountType: string;
  amount: number;
  mimeType: string;
  submittedAt: string | null;
  customerName: string;
  customerPhone: string;
  stylistName: string | null;
  scheduledDate: string;
  scheduledTime: string;
  appointmentStatus: string;
};

export function PaymentProofReviewQueue({ proofs: initialProofs }: { proofs: Proof[] }) {
  const [proofs, setProofs] = useState(initialProofs);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function decide(proofId: string, decision: "approve" | "reject") {
    setBusyId(proofId);
    setErrors((current) => ({ ...current, [proofId]: "" }));
    const result = await reviewMobileMoneyProof({ proofId, decision, note: notes[proofId] || undefined });
    setBusyId(null);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [proofId]: result.error }));
      return;
    }
    setProofs((current) => current.filter((proof) => proof.id !== proofId));
  }

  if (proofs.length === 0) {
    return <div className="rounded-card border border-line bg-surface p-6 text-sm text-ink-soft">No payment proofs are waiting for review.</div>;
  }

  return (
    <div className="space-y-5">
      {proofs.map((proof) => (
        <article key={proof.id} className="grid gap-5 rounded-card border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:p-6">
          <div>
            {/* This endpoint checks the current reviewer session and never caches the binary. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/payment-proofs/${encodeURIComponent(proof.id)}`} alt={`Private Mobile Money proof from ${proof.customerName}`} className="max-h-[32rem] w-full rounded-sm border border-line bg-canvas object-contain" />
          </div>
          <div className="flex flex-col">
            <div>
              <h2 className="font-display text-xl text-ink">{proof.customerName}</h2>
              <p className="mt-1 text-sm text-ink-soft">{proof.customerPhone} · Stylist: {proof.stylistName ?? "Unassigned"} · {proof.scheduledDate} at {proof.scheduledTime}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-ink-soft">Submitted amount</dt><dd className="font-medium text-ink">GH₵{proof.amount.toFixed(2)} ({proof.amountType})</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-soft">Appointment</dt><dd className="text-ink">{proof.appointmentStatus}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-soft">Received</dt><dd className="text-ink">{proof.submittedAt ? new Date(proof.submittedAt).toLocaleString() : "—"}</dd></div>
              </dl>
              <a className="mt-3 inline-block text-sm text-bronze-600 underline" href={`/admin/appointments/${encodeURIComponent(proof.appointmentId)}`}>Open appointment record</a>
            </div>
            <label className="mt-5 block text-sm font-medium text-ink" htmlFor={`proof-note-${proof.id}`}>Reviewer note (required for rejection)</label>
            <textarea id={`proof-note-${proof.id}`} value={notes[proof.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [proof.id]: event.target.value }))} maxLength={500} rows={3} className="mt-1 w-full rounded-sm border border-line bg-canvas p-3 text-sm text-ink" placeholder="Add context or explain why the screenshot was not accepted." />
            {errors[proof.id] && <p className="mt-2 text-sm text-rust">{errors[proof.id]}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={busyId === proof.id} onClick={() => decide(proof.id, "approve")} className="rounded-sm bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busyId === proof.id ? "Saving…" : "Approve payment"}</button>
              <button type="button" disabled={busyId === proof.id || !(notes[proof.id] ?? "").trim()} onClick={() => decide(proof.id, "reject")} className="rounded-sm border border-rust/40 px-4 py-2 text-sm font-medium text-rust disabled:opacity-50">Reject and request new proof</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
