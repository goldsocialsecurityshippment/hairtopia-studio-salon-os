"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSalonSettings } from "@/lib/actions/catalogue";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Settings = {
  name: string;
  address: string;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  openTime: string;
  closeTime: string;
  checkInRadiusMeters: number;
  attendanceGracePeriodMinutes: number;
  cancellationPolicy: string;
  noShowGraceMinutes: number;
  depositEnabled: boolean;
  depositPercent: number;
  bookingBufferMinutes: number;
  depositMode: "flat" | "percent";
  depositFlatAmount: number;
  cancellationWindowHours: number;
  overbookingAllowed: boolean;
  overtimeAllowedMinutes: number;
  lowStockDefaultThreshold: number;
} | null;

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: settings?.name ?? "Hairtopia Studio",
    address: settings?.address ?? "266 Afro Osro Street",
    mapUrl: settings?.mapUrl ?? "",
    latitude: settings?.latitude?.toString() ?? "",
    longitude: settings?.longitude?.toString() ?? "",
    phone: settings?.phone ?? "",
    email: settings?.email ?? "nikinuel@gmail.com",
    instagram: settings?.instagram ?? "@Hairtopia_Studio",
    facebook: settings?.facebook ?? "Hairtopia",
    openTime: settings?.openTime ?? "08:30",
    closeTime: settings?.closeTime ?? "19:30",
    checkInRadiusMeters: settings?.checkInRadiusMeters ?? 100,
    attendanceGracePeriodMinutes: settings?.attendanceGracePeriodMinutes ?? 10,
    cancellationPolicy: settings?.cancellationPolicy ?? "",
    noShowGraceMinutes: settings?.noShowGraceMinutes ?? 20,
    depositEnabled: settings?.depositEnabled ?? false,
    depositPercent: settings?.depositPercent ?? 20,
    bookingBufferMinutes: settings?.bookingBufferMinutes ?? 15,
    depositMode: settings?.depositMode ?? "flat",
    depositFlatAmount: settings?.depositFlatAmount ?? 100,
    cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
    overbookingAllowed: settings?.overbookingAllowed ?? false,
    overtimeAllowedMinutes: settings?.overtimeAllowedMinutes ?? 0,
    lowStockDefaultThreshold: settings?.lowStockDefaultThreshold ?? 5,
  });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateSalonSettings({
      ...form,
      latitude: form.latitude ? Number(form.latitude) : undefined,
      longitude: form.longitude ? Number(form.longitude) : undefined,
      checkInRadiusMeters: Number(form.checkInRadiusMeters),
      attendanceGracePeriodMinutes: Number(form.attendanceGracePeriodMinutes),
      noShowGraceMinutes: Number(form.noShowGraceMinutes),
      depositPercent: Number(form.depositPercent),
      bookingBufferMinutes: Number(form.bookingBufferMinutes),
      depositFlatAmount: Number(form.depositFlatAmount),
      cancellationWindowHours: Number(form.cancellationWindowHours),
      overtimeAllowedMinutes: Number(form.overtimeAllowedMinutes),
      lowStockDefaultThreshold: Number(form.lowStockDefaultThreshold),
    });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Business information</h2>
        <Input label="Salon name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <Input label="Address" value={form.address} onChange={(e) => set("address", e.target.value)} />
        <Input label="Google Maps link" value={form.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude (for check-in verification)" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} />
          <Input label="Longitude (for check-in verification)" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} />
        </div>
        <Input label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <Input label="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Instagram / Facebook handle" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          <Input label="Facebook page name" value={form.facebook} onChange={(e) => set("facebook", e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Hours & booking</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Opening time" type="time" value={form.openTime} onChange={(e) => set("openTime", e.target.value)} />
          <Input label="Closing time" type="time" value={form.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
        </div>
        <Input label="Booking buffer between appointments (minutes)" type="number" value={form.bookingBufferMinutes} onChange={(e) => set("bookingBufferMinutes", Number(e.target.value) as never)} />
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Attendance & check-in</h2>
        <Input label="Check-in radius (meters)" type="number" value={form.checkInRadiusMeters} onChange={(e) => set("checkInRadiusMeters", Number(e.target.value) as never)} />
        <Input label="Attendance grace period (minutes)" type="number" value={form.attendanceGracePeriodMinutes} onChange={(e) => set("attendanceGracePeriodMinutes", Number(e.target.value) as never)} />
        <Input label="No-show grace period (minutes)" type="number" value={form.noShowGraceMinutes} onChange={(e) => set("noShowGraceMinutes", Number(e.target.value) as never)} />
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Policies</h2>
        <Textarea label="Cancellation policy" rows={3} value={form.cancellationPolicy} onChange={(e) => set("cancellationPolicy", e.target.value)} />
        <Input label="Cancellation window (hours before appointment)" type="number" value={form.cancellationWindowHours} onChange={(e) => set("cancellationWindowHours", Number(e.target.value) as never)} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.depositEnabled} onChange={(e) => set("depositEnabled", e.target.checked)} />
          Require a deposit for bookings
        </label>
        {form.depositEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Deposit mode</label>
              <select
                value={form.depositMode}
                onChange={(e) => set("depositMode", e.target.value as "flat" | "percent")}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                <option value="flat">Flat amount (GH₵)</option>
                <option value="percent">Percentage of price</option>
              </select>
            </div>
            {form.depositMode === "flat" ? (
              <Input label="Flat deposit (GH₵)" type="number" value={form.depositFlatAmount} onChange={(e) => set("depositFlatAmount", Number(e.target.value) as never)} />
            ) : (
              <Input label="Deposit percentage" type="number" value={form.depositPercent} onChange={(e) => set("depositPercent", Number(e.target.value) as never)} />
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Overbooking &amp; overtime</h2>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.overbookingAllowed} onChange={(e) => set("overbookingAllowed", e.target.checked)} />
          Allow overbooking (back-to-back slots without the buffer gap)
        </label>
        <Input
          label="Overtime allowed past closing (minutes)"
          type="number"
          value={form.overtimeAllowedMinutes}
          onChange={(e) => set("overtimeAllowedMinutes", Number(e.target.value) as never)}
        />
        <p className="text-xs text-ink-soft">
          These directly change what slots the booking engine offers — not just a display setting.
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg text-ink">Inventory</h2>
        <Input
          label="Default low-stock threshold for new items"
          type="number"
          value={form.lowStockDefaultThreshold}
          onChange={(e) => set("lowStockDefaultThreshold", Number(e.target.value) as never)}
        />
      </Card>

      {error && <p className="text-sm text-rust">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={pending}>Save settings</Button>
        {saved && <span className="text-sm text-moss">Saved.</span>}
      </div>
    </div>
  );
}
