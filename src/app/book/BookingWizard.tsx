"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAvailableSlots,
  createAppointment,
} from "@/lib/actions/booking";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

type Variation = {
  id: string;
  label: string;
  price: number;
  isDefault?: boolean;
};

type ServiceLite = {
  id: string;
  name: string;
  description: string | null;
  priceMin: number;
  priceMax: number | null;
  durationMinutes: number;
  variations: Variation[];
};

type Category = {
  id: string;
  name: string;
  services: ServiceLite[];
};

type StylistLite = {
  id: string;
  name: string;
  serviceIds: string[];
  avgRating: number | null;
  reviewCount: number;
  specialties: string | null;
};

const STEPS = [
  "Service",
  "Stylist",
  "Date & time",
  "Your details",
  "Review",
];

export function BookingWizard({
  categories,
  stylists,
  defaultName,
  defaultPhone,
}: {
  categories: Category[];
  stylists: StylistLite[];
  defaultName: string;
  defaultPhone: string;
}) {
  const router = useRouter();

  const [step, setStep] = useState(0);

  const [selectedServiceIds, setSelectedServiceIds] =
    useState<string[]>([]);

  const [variationIds, setVariationIds] = useState<
    Record<string, string | null>
  >({});

  const [stylistId, setStylistId] = useState<string | null>(null);

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

  const allServices = useMemo(
    () => categories.flatMap((category) => category.services),
    [categories]
  );

  const selectedServices = useMemo(
    () =>
      allServices.filter((service) =>
        selectedServiceIds.includes(service.id)
      ),
    [allServices, selectedServiceIds]
  );

  const selectedStylist =
    stylists.find((stylist) => stylist.id === stylistId) ?? null;

  const totalPrice = useMemo(
    () =>
      selectedServices.reduce((total, service) => {
        const variationId = variationIds[service.id];

        const variation = service.variations.find(
          (item) => item.id === variationId
        );

        return total + (variation?.price ?? service.priceMin);
      }, 0),
    [selectedServices, variationIds]
  );

  const totalDuration = useMemo(
    () =>
      selectedServices.reduce(
        (total, service) => total + service.durationMinutes,
        0
      ),
    [selectedServices]
  );

  const eligibleStylists = useMemo(() => {
    if (selectedServiceIds.length === 0) {
      return [];
    }

    return stylists.filter((stylist) =>
      selectedServiceIds.every((serviceId) =>
        stylist.serviceIds.includes(serviceId)
      )
    );
  }, [stylists, selectedServiceIds]);

  const minDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
  }).format(new Date());

  function hasMissingVariation(): boolean {
    return selectedServices.some(
      (service) =>
        service.variations.length > 0 &&
        !variationIds[service.id]
    );
  }

  async function loadSlots(
    newStylistId: string,
    newDate: string
  ) {
    if (
      !newStylistId ||
      !newDate ||
      selectedServiceIds.length === 0
    ) {
      return;
    }

    setLoadingSlots(true);
    setSlots([]);
    setTime("");
    setError(null);

    try {
      const result = await getAvailableSlots({
        stylistId: newStylistId,
        serviceIds: selectedServiceIds,
        date: newDate,
      });

      setSlots(result);
    } catch {
      setError(
        "Unable to load available times. Please try again."
      );
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          setError(
            data.error || "Upload failed. Please try again."
          );
          continue;
        }

        if (data.url) {
          setReferenceUrls((previous) => [
            ...previous,
            data.url,
          ]);
        }
      }
    } catch {
      setError(
        "Unable to upload the file. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  function handleServiceToggle(service: ServiceLite) {
    setError(null);

    const isSelected = selectedServiceIds.includes(service.id);

    if (isSelected) {
      setSelectedServiceIds((previous) =>
        previous.filter((id) => id !== service.id)
      );

      setVariationIds((previous) => {
        const next = { ...previous };
        delete next[service.id];
        return next;
      });

      setStylistId(null);
      setDate("");
      setTime("");
      setSlots([]);

      return;
    }

    const defaultVariation =
      service.variations.find(
        (variation) => variation.isDefault
      ) ?? null;

    setSelectedServiceIds((previous) => [
      ...previous,
      service.id,
    ]);

    setVariationIds((previous) => ({
      ...previous,
      [service.id]: defaultVariation?.id ?? null,
    }));

    setStylistId(null);
    setDate("");
    setTime("");
    setSlots([]);
  }

  function handleVariationSelect(
    serviceId: string,
    variationId: string
  ) {
    setVariationIds((previous) => ({
      ...previous,
      [serviceId]: variationId,
    }));

    setError(null);
  }

  function handleStylistSelect(newStylistId: string) {
    setStylistId(newStylistId);
    setDate("");
    setTime("");
    setSlots([]);
    setError(null);
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    setTime("");
    setSlots([]);
    setError(null);

    if (stylistId) {
      void loadSlots(stylistId, newDate);
    }
  }

  function canProceed(): boolean {
    if (step === 0) {
      return (
        selectedServiceIds.length > 0 &&
        !hasMissingVariation()
      );
    }

    if (step === 1) {
      return !!stylistId;
    }

    if (step === 2) {
      return !!date && !!time && !loadingSlots;
    }

    if (step === 3) {
      return (
        customerName.trim().length > 1 &&
        customerPhone.trim().length >= 9 &&
        !uploading
      );
    }

    return true;
  }

  function goNext() {
    if (!canProceed()) {
      return;
    }

    setError(null);
    setStep((current) => current + 1);
  }

  async function handleConfirm() {
    if (
      selectedServiceIds.length === 0 ||
      !stylistId ||
      !date ||
      !time ||
      submitting ||
      uploading
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createAppointment({
        services: selectedServiceIds.map((serviceId) => ({
          serviceId,
          variationId:
            variationIds[serviceId] ?? undefined,
        })),

        stylistId,

        date,

        time,

        customerName: customerName.trim(),

        customerPhone: customerPhone.trim(),

        instructions:
          instructions.trim() || undefined,

        referenceUrls,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmedId(result.appointmentId);
    } catch {
      setError(
        "Something went wrong while creating your appointment. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedId) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="font-display text-2xl text-ink">
          Booking confirmed
        </p>

        <p className="mt-2 text-sm text-ink-soft">
          {selectedServices
            .map((service) => service.name)
            .join(", ")}
          {" with "}
          {selectedStylist?.name}
          {" on "}
          {date}
          {" at "}
          {time}.
        </p>

        <p className="mt-3 text-sm text-ink-soft">
          Estimated total: GH₵{totalPrice}
        </p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            onClick={() =>
              router.push(
                `/account/appointments/${confirmedId}`
              )
            }
          >
            View appointment
          </Button>

          <Button
            variant="secondary"
            onClick={() => router.push("/")}
          >
            Back home
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2 ${
              index === step
                ? "text-ink"
                : index < step
                  ? "text-bronze-500"
                  : "text-ink-soft/50"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                index === step
                  ? "bg-ink text-canvas"
                  : index < step
                    ? "bg-bronze-400 text-canvas"
                    : "bg-ink/10"
              }`}
            >
              {index + 1}
            </span>

            {label}
          </li>
        ))}
      </ol>

      {/* Error */}
      {error && (
        <p className="mb-4 rounded-sm bg-rust/10 px-3 py-2 text-sm text-rust">
          {error}
        </p>
      )}

      {/* STEP 0 */}
      {step === 0 && (
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-xl text-ink">
              Choose your services
            </h2>

            <p className="mt-1 text-sm text-ink-soft">
              You can select more than one service for
              the same appointment.
            </p>
          </div>

          {categories.map((category) => (
            <div key={category.id}>
              <h3 className="font-display text-lg text-ink">
                {category.name}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {category.services.map((service) => {
                  const selected =
                    selectedServiceIds.includes(
                      service.id
                    );

                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() =>
                        handleServiceToggle(service)
                      }
                      className={`rounded-card border p-4 text-left transition-colors ${
                        selected
                          ? "border-bronze-400 bg-bronze-50"
                          : "border-line bg-surface hover:border-ink/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ink">
                          {service.name}
                        </p>

                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                            selected
                              ? "border-bronze-400 bg-bronze-400 text-white"
                              : "border-line"
                          }`}
                        >
                          {selected ? "✓" : ""}
                        </span>
                      </div>

                      {service.description && (
                        <p className="mt-1 text-xs text-ink-soft">
                          {service.description}
                        </p>
                      )}

                      <p className="mt-2 text-xs text-ink-soft">
                        GH₵{service.priceMin}
                        {service.priceMax
                          ? `–${service.priceMax}`
                          : "+"}{" "}
                        · {service.durationMinutes} min
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedServices.length > 0 && (
            <Card className="p-5">
              <h3 className="font-display text-lg text-ink">
                Selected services
              </h3>

              <div className="mt-4 space-y-4">
                {selectedServices.map((service) => (
                  <div
                    key={service.id}
                    className="border-b border-line pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {service.name}
                        </p>

                        <p className="mt-1 text-xs text-ink-soft">
                          {service.durationMinutes} min
                        </p>
                      </div>

                      <p className="text-sm text-ink">
                        GH₵
                        {service.variations.length > 0
                          ? service.variations.find(
                              (variation) =>
                                variation.id ===
                                variationIds[
                                  service.id
                                ]
                            )?.price ??
                            service.priceMin
                          : service.priceMin}
                      </p>
                    </div>

                    {service.variations.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {service.variations.map(
                          (variation) => (
                            <button
                              key={variation.id}
                              type="button"
                              onClick={() =>
                                handleVariationSelect(
                                  service.id,
                                  variation.id
                                )
                              }
                              className={`rounded-sm border px-3 py-2 text-left text-sm ${
                                variationIds[
                                  service.id
                                ] === variation.id
                                  ? "border-bronze-400 bg-bronze-50 text-ink"
                                  : "border-line text-ink-soft hover:border-ink/30"
                              }`}
                            >
                              <span className="font-medium">
                                {variation.label}
                              </span>

                              <span className="ml-2 text-xs">
                                GH₵{variation.price}
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-between border-t border-line pt-4">
                <span className="text-sm text-ink-soft">
                  Estimated total
                </span>

                <span className="text-sm font-medium text-ink">
                  GH₵{totalPrice}
                </span>
              </div>

              <p className="mt-1 text-right text-xs text-ink-soft">
                Total duration: {totalDuration} min
              </p>
            </Card>
          )}
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <div>
          <h2 className="font-display text-xl text-ink">
            Choose your stylist
          </h2>

          <p className="mt-1 text-sm text-ink-soft">
            Showing stylists who can perform all
            selected services.
          </p>

          {eligibleStylists.length === 0 ? (
            <p className="mt-6 text-sm text-ink-soft">
              No stylists are currently assigned to
              all of your selected services. Please go
              back and change your selection.
            </p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {eligibleStylists.map((stylist) => (
                <button
                  key={stylist.id}
                  type="button"
                  onClick={() =>
                    handleStylistSelect(stylist.id)
                  }
                  className={`rounded-card border p-4 text-left transition-colors ${
                    stylistId === stylist.id
                      ? "border-bronze-400 bg-bronze-50"
                      : "border-line bg-surface hover:border-ink/30"
                  }`}
                >
                  <p className="text-sm font-medium text-ink">
                    {stylist.name}
                  </p>

                  {stylist.specialties && (
                    <p className="mt-1 text-xs text-ink-soft">
                      {stylist.specialties}
                    </p>
                  )}

                  {stylist.avgRating !== null ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      ★{" "}
                      {stylist.avgRating.toFixed(1)} (
                      {stylist.reviewCount})
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-soft">
                      New stylist
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-xl text-ink">
              Choose date & time
            </h2>

            <p className="mt-1 text-sm text-ink-soft">
              Your selected services require{" "}
              {totalDuration} minutes.
            </p>
          </div>

          <Input
            label="Choose a date"
            type="date"
            min={minDate}
            value={date}
            onChange={(event) =>
              handleDateChange(event.target.value)
            }
          />

          {date && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink">
                Available times
              </p>

              {loadingSlots && (
                <p className="text-sm text-ink-soft">
                  Loading available times…
                </p>
              )}

              {!loadingSlots && slots.length === 0 && (
                <p className="text-sm text-ink-soft">
                  No times are available on this day.
                  Please try another date.
                </p>
              )}

              {!loadingSlots && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
                        time === slot
                          ? "border-bronze-400 bg-bronze-50 text-ink"
                          : "border-line text-ink-soft hover:border-ink/30"
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="max-w-md space-y-5">
          <div>
            <h2 className="font-display text-xl text-ink">
              Your details
            </h2>

            <p className="mt-1 text-sm text-ink-soft">
              Tell us how to contact you about your
              appointment.
            </p>
          </div>

          <Input
            label="Your name"
            value={customerName}
            onChange={(event) =>
              setCustomerName(event.target.value)
            }
            required
          />

          <Input
            label="Phone number"
            value={customerPhone}
            onChange={(event) =>
              setCustomerPhone(event.target.value)
            }
            required
          />

          <Textarea
            label="Instructions (optional)"
            rows={4}
            value={instructions}
            onChange={(event) =>
              setInstructions(event.target.value)
            }
            placeholder="Tell your stylist anything they should know."
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Reference photo or video (optional)
            </span>

            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) =>
                handleFileUpload(event.target.files)
              }
              disabled={uploading}
              className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-sm file:border-0 file:bg-bronze-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-bronze-600 disabled:opacity-50"
            />

            {uploading && (
              <p className="mt-1 text-xs text-ink-soft">
                Uploading…
              </p>
            )}

            {referenceUrls.length > 0 && (
              <p className="mt-1 text-xs text-moss">
                {referenceUrls.length} file(s) attached.
              </p>
            )}

            <p className="mt-2 text-xs text-ink-soft">
              Reference images help communicate your
              preferred style. Final results may vary
              depending on hair type, length, condition,
              and professional recommendations.
            </p>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Card className="max-w-md p-6">
          <h2 className="font-display text-xl text-ink">
            Review your booking
          </h2>

          <div className="mt-6 space-y-4">
            <div>
              <p className="text-xs text-ink-soft">
                Services
              </p>

              <div className="mt-2 space-y-2">
                {selectedServices.map((service) => {
                  const variationId =
                    variationIds[service.id];

                  const variation =
                    service.variations.find(
                      (item) =>
                        item.id === variationId
                    );

                  return (
                    <div
                      key={service.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="text-ink">
                          {service.name}
                        </p>

                        {variation && (
                          <p className="text-xs text-ink-soft">
                            {variation.label}
                          </p>
                        )}
                      </div>

                      <p className="text-ink">
                        GH₵
                        {variation?.price ??
                          service.priceMin}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between gap-4 border-t border-line pt-3">
              <dt className="text-ink-soft">
                Stylist
              </dt>

              <dd className="text-right text-ink">
                {selectedStylist?.name}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">
                Date
              </dt>

              <dd className="text-right text-ink">
                {date}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">
                Time
              </dt>

              <dd className="text-right text-ink">
                {time}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">
                Duration
              </dt>

              <dd className="text-right text-ink">
                {totalDuration} min
              </dd>
            </div>

            <div className="flex justify-between gap-4 border-t border-line pt-3">
              <dt className="font-medium text-ink">
                Estimated price
              </dt>

              <dd className="font-medium text-ink">
                GH₵{totalPrice}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">
                Name
              </dt>

              <dd className="text-right text-ink">
                {customerName}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">
                Phone
              </dt>

              <dd className="text-right text-ink">
                {customerPhone}
              </dd>
            </div>
          </div>

          <p className="mt-5 text-xs text-ink-soft">
            This is an estimated price and may change
            based on the final style and professional
            recommendations.
          </p>
        </Card>
      )}

      {/* Navigation */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setStep((current) => current - 1);
            }}
            disabled={submitting}
          >
            Back
          </Button>
        )}

        {step < STEPS.length - 1 ? (
          <Button
            onClick={goNext}
            disabled={!canProceed() || submitting}
          >
            Continue
          </Button>
        ) : (
          <Button
            onClick={handleConfirm}
            loading={submitting}
            disabled={!canProceed() || submitting}
          >
            Confirm booking
          </Button>
        )}
      </div>
    </div>
  );
}