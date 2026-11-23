"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlots, createAppointment } from "@/lib/actions/booking";
import { getActiveServiceTerms } from "@/lib/actions/service-terms";
import { submitMobileMoneyProof } from "@/lib/actions/payment-proofs";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

type Variation = { id: string; label: string; price: number; isDefault?: boolean };
type ServiceLite = {
  id: string;
  name: string;
  description: string | null;
  priceMin: number;
  priceMax: number | null;
  durationMinutes: number;
  variations: Variation[];
};
type Category = { id: string; name: string; services: ServiceLite[] };
type StylistLite = {
  id: string;
  name: string;
  serviceIds: string[];
  avgRating: number | null;
  reviewCount: number;
  specialties: string | null;
};

const STEPS = ["Service", "Stylist", "Date & time", "Your details", "Review"];

export function BookingWizard({
  categories,
  stylists,
  defaultName,
  defaultPhone,
  preselectedStylistId,
}: {
  categories: Category[];
  stylists: StylistLite[];
  defaultName: string;
  defaultPhone: string;
  preselectedStylistId?: string | null;
}) {
  const [step, setStep] = useState(0);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [stylistId, setStylistId] = useState<string | null>(preselectedStylistId ?? null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [customerName, setCustomerName] = useState(defaultName);
  const [customerPhone, setCustomerPhone] = useState(defaultPhone);
  const [instructions, setInstructions] = useState("");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [depositRequired, setDepositRequired] = useState(0);
  const [fullAmount, setFullAmount] = useState(0);
  const [activeTerms, setActiveTerms] = useState<{ id: string; title: string; content: string; version: number } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const allServices = useMemo(() => categories.flatMap((c) => c.services), [categories]);
  const selectedService = allServices.find((s) => s.id === serviceId) ?? null;

  useEffect(() => {
    setTermsAccepted(false);
    if (!serviceId) {
      setActiveTerms(null);
      return;
    }
    getActiveServiceTerms(serviceId).then((terms) => setActiveTerms(terms));
  }, [serviceId]);
  const selectedVariation = selectedService?.variations.find((v) => v.id === variationId) ?? null;
  const eligibleStylists = stylists.filter((s) => serviceId && s.serviceIds.includes(serviceId));
  const selectedStylist = stylists.find((s) => s.id === stylistId) ?? null;
  const price = selectedVariation?.price ?? selectedService?.priceMin ?? 0;

  const minDate = new Date().toISOString().slice(0, 10);

  async function loadSlots(newStylistId: string, newDate: string) {
    if (!serviceId || !newStylistId || !newDate) return;
    setLoadingSlots(true);
    setSlots([]);
    setTime("");
    try {
      const result = await getAvailableSlots({ stylistId: newStylistId, serviceId, date: newDate });
      setSlots(result);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed. Please try again.");
          continue;
        }
        setReferenceUrls((prev) => [...prev, data.url]);
      }
    } finally {
      setUploading(false);
    }
  }

  function canProceed(): boolean {
    if (step === 0) return !!serviceId && (selectedService!.variations.length === 0 || !!variationId);
    if (step === 1) return !!stylistId;
    if (step === 2) return !!date && !!time;
    if (step === 3) return customerName.trim().length > 1 && customerPhone.trim().length > 8;
    if (step === 4) return !activeTerms || termsAccepted;
    return true;
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await createAppointment({
      serviceId: serviceId!,
      variationId: variationId ?? undefined,
      stylistId: stylistId!,
      date,
      time,
      customerName,
      customerPhone,
      instructions: instructions || undefined,
      referenceUrls,
      acceptedTermsId: activeTerms?.id,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmedId(result.appointmentId);
    setDepositRequired(result.depositRequired);
    setFullAmount(result.priceEstimate);
  }

  if (confirmedId) {
    return <PaymentProofStep appointmentId={confirmedId} depositAmount={depositRequired} fullAmount={fullAmount} defaultPhone={customerPhone} />;
  }

  return (
    <div>
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 ${i === step ? "text-ink" : i < step ? "text-bronze-500" : "text-ink-soft/50"}`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                i === step ? "bg-ink text-canvas" : i < step ? "bg-bronze-400 text-canvas" : "bg-ink/10"
              }`}
            >
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 rounded-sm bg-rust/10 px-3 py-2 text-sm text-rust">{error}</p>}

      {/* STEP 0: Service */}
      {step === 0 && (
        <div className="space-y-8">
          {categories.map((cat) => (
            <div key={cat.id}>
              <h3 className="font-display text-lg text-ink">{cat.name}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {cat.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setServiceId(s.id);
                      setVariationId(s.variations.find((v) => v.isDefault)?.id ?? null);
                      setStylistId(null);
                    }}
                    className={`rounded-card border p-4 text-left transition-colors ${
                      serviceId === s.id ? "border-bronze-400 bg-bronze-50" : "border-line bg-surface hover:border-ink/30"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink">{s.name}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      GH₵{s.priceMin}
                      {s.priceMax ? `–${s.priceMax}` : "+"} · {s.durationMinutes} min
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {selectedService && selectedService.variations.length > 0 && (
            <div>
              <h3 className="font-display text-lg text-ink">Choose your option</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {selectedService.variations.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariationId(v.id)}
                    className={`rounded-card border p-4 text-left transition-colors ${
                      variationId === v.id ? "border-bronze-400 bg-bronze-50" : "border-line bg-surface hover:border-ink/30"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink">{v.label}</p>
                    <p className="mt-1 text-xs text-ink-soft">GH₵{v.price}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 1: Stylist */}
      {step === 1 && (
        <div>
          {eligibleStylists.length === 0 ? (
            <p className="text-sm text-ink-soft">No stylists are currently assigned to this service. Please choose another service.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {eligibleStylists.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStylistId(s.id)}
                  className={`rounded-card border p-4 text-left transition-colors ${
                    stylistId === s.id ? "border-bronze-400 bg-bronze-50" : "border-line bg-surface hover:border-ink/30"
                  }`}
                >
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  {s.specialties && <p className="mt-1 text-xs text-ink-soft">{s.specialties}</p>}
                  {s.avgRating ? (
                    <p className="mt-1 text-xs text-ink-soft">★ {s.avgRating.toFixed(1)} ({s.reviewCount})</p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-soft">New stylist</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Date & time */}
      {step === 2 && (
        <div className="space-y-6">
          <Input
            label="Choose a date"
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (stylistId) loadSlots(stylistId, e.target.value);
            }}
          />
          {date && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Available times</p>
              {loadingSlots && <p className="text-sm text-ink-soft">Loading available times…</p>}
              {!loadingSlots && slots.length === 0 && (
                <p className="text-sm text-ink-soft">No times available this day. Please try another date.</p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
                      time === s ? "border-bronze-400 bg-bronze-50 text-ink" : "border-line text-ink-soft hover:border-ink/30"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Details */}
      {step === 3 && (
        <div className="max-w-md space-y-5">
          <Input label="Your name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          <Input label="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
          <Textarea
            label="Instructions (optional)"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Tell your stylist anything they should know."
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Reference photo or video (optional)</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-sm file:border-0 file:bg-bronze-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-bronze-600"
            />
            {uploading && <p className="mt-1 text-xs text-ink-soft">Uploading…</p>}
            {referenceUrls.length > 0 && (
              <p className="mt-1 text-xs text-moss">{referenceUrls.length} file(s) attached.</p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Reference images help communicate your preferred style. Final results may vary depending on hair type,
              length, condition, and professional recommendations.
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: Review */}
      {step === 4 && (
        <Card className="max-w-md p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Service</dt><dd className="text-ink">{selectedService?.name}</dd></div>
            {selectedVariation && (
              <div className="flex justify-between"><dt className="text-ink-soft">Option</dt><dd className="text-ink">{selectedVariation.label}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-ink-soft">Stylist</dt><dd className="text-ink">{selectedStylist?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Date</dt><dd className="text-ink">{date}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Time</dt><dd className="text-ink">{time}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Estimated price</dt><dd className="text-ink">GH₵{price}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Name</dt><dd className="text-ink">{customerName}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">Phone</dt><dd className="text-ink">{customerPhone}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-soft">
            This is a price estimate and may change based on style and preference.
          </p>

          {activeTerms && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink">{activeTerms.title}</p>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-sm border border-line bg-bronze-50/40 p-3 text-xs text-ink-soft whitespace-pre-line">
                {activeTerms.content}
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5"
                />
                I have read and accept the Terms &amp; Conditions above.
              </label>
            </div>
          )}
        </Card>
      )}

      {/* Nav */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
            Continue
          </Button>
        ) : (
          <Button onClick={handleConfirm} loading={submitting} disabled={!canProceed()}>
            Confirm booking
          </Button>
        )}
      </div>
    </div>
  );
}

/** A booking stays pending until staff approve the uploaded transfer proof. */
function PaymentProofStep({
  appointmentId,
  depositAmount,
  fullAmount,
  defaultPhone,
}: {
  appointmentId: string;
  depositAmount: number;
  fullAmount: number;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [customerPhone, setCustomerPhone] = useState(defaultPhone);
  const [amountType, setAmountType] = useState<"deposit" | "full">(depositAmount > 0 ? "deposit" : "full");
  const [file, setFile] = useState<File | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [proofAmount, setProofAmount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeAmountType(next: "deposit" | "full") {
    setAmountType(next);
    setProofId(null);
    setProofAmount(null);
    setError(null);
  }

  async function uploadProof() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("appointmentId", appointmentId);
      form.append("customerPhone", customerPhone);
      form.append("amountType", amountType);
      form.append("file", file);
      const response = await fetch("/api/payment-proofs", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Screenshot upload failed.");
      setProofId(result.proofId);
      setProofAmount(result.amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screenshot upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function submitProof() {
    if (!proofId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitMobileMoneyProof({ appointmentId, customerPhone, proofId });
      if (!result.ok) throw new Error(result.error);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The proof could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="font-display text-2xl text-ink">Payment proof submitted</p>
        <p className="mt-3 text-sm text-ink-soft">Your booking is pending while the salon reviews your Mobile Money screenshot. We&apos;ll update you when it has been reviewed.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push(`/account/appointments/${appointmentId}`)}>View appointment</Button>
          <Button variant="secondary" onClick={() => router.push("/book")}>Start another appointment</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg p-8">
      <p className="font-display text-xl text-ink">Send Mobile Money and upload proof</p>
      <p className="mt-1 text-sm text-ink-soft">Your appointment remains pending until staff verify your screenshot. Transfer to the recipient below, then upload the payment confirmation.</p>
      <div className="mt-4 rounded-sm border border-bronze-200 bg-bronze-50/60 p-4 text-sm text-ink">
        <p><span className="text-ink-soft">MoMo number:</span> <strong>0501223210</strong></p>
        <p className="mt-1"><span className="text-ink-soft">Recipient:</span> <strong>Diane Nikita Nuel</strong></p>
      </div>

      <div className="mt-5 space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Choose payment amount</legend>
          {depositAmount > 0 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-line p-3 text-sm text-ink">
              <input type="radio" name="proof-amount" checked={amountType === "deposit"} onChange={() => changeAmountType("deposit")} />
              Deposit — GH₵{depositAmount.toFixed(2)}
            </label>
          )}
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-sm border border-line p-3 text-sm text-ink">
            <input type="radio" name="proof-amount" checked={amountType === "full"} onChange={() => changeAmountType("full")} />
            Full outstanding amount — GH₵{fullAmount.toFixed(2)}
          </label>
        </fieldset>
        <Input label="Phone number on your booking" value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setProofId(null); setProofAmount(null); }} required />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="payment-proof-image">Payment screenshot (JPG, PNG or WEBP; maximum 8MB)</label>
          <input id="payment-proof-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProofId(null); setProofAmount(null); }} className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-sm file:border-0 file:bg-bronze-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-bronze-600" />
        </div>
        {proofId && <p className="text-sm text-moss">Screenshot uploaded privately. Amount due: GH₵{proofAmount?.toFixed(2)}.</p>}
        {error && <p className="text-sm text-rust">{error}</p>}
        {!proofId ? (
          <Button className="w-full" loading={uploading} disabled={!file || customerPhone.trim().length < 9} onClick={uploadProof}>Upload screenshot</Button>
        ) : (
          <Button className="w-full" loading={submitting} disabled={!proofId} onClick={submitProof}>Submit payment proof for review</Button>
        )}
        <p className="text-xs text-ink-soft">The amount is checked against your booking on the server. A screenshot is required; the browser cannot mark a payment or appointment as paid.</p>
      </div>
    </Card>
  );
}
