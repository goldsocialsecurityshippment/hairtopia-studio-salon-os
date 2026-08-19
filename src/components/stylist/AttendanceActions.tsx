"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkIn, checkOut } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/Button";

export function AttendanceActions({
  hasCheckedIn,
  hasCheckedOut,
}: {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function getLocation(): Promise<{ lat?: number; lng?: number }> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 8000 }
      );
    });
  }

  async function handleCheckIn() {
    setPending(true);
    setMessage(null);
    const { lat, lng } = await getLocation();
    const result = await checkIn({ lat, lng });
    setPending(false);
    if (!result.ok) return setMessage(result.error);
    setMessage(
      result.verified
        ? result.late
          ? "Checked in (location verified). You're marked late."
          : "Checked in — location verified. Have a great shift!"
        : "Checked in, but we couldn't verify your location. This has been recorded as an unverified check-in."
    );
    router.refresh();
  }

  async function handleCheckOut() {
    setPending(true);
    setMessage(null);
    const { lat, lng } = await getLocation();
    const result = await checkOut({ lat, lng });
    setPending(false);
    if (!result.ok) return setMessage(result.error);
    setMessage("Checked out. See you next time!");
    router.refresh();
  }

  return (
    <div>
      {!hasCheckedIn && (
        <Button onClick={handleCheckIn} loading={pending} className="w-full">
          Check in
        </Button>
      )}
      {hasCheckedIn && !hasCheckedOut && (
        <Button onClick={handleCheckOut} loading={pending} variant="secondary" className="w-full">
          Check out
        </Button>
      )}
      {hasCheckedIn && hasCheckedOut && (
        <p className="text-sm text-ink-soft">You&apos;ve completed your shift for today.</p>
      )}
      {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
