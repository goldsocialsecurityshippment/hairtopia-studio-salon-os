"use client";

import { useEffect } from "react";

/** Registers the service worker on every page load, unconditionally and
 * silently. This alone does NOT subscribe the user to push — that's an
 * explicit, permission-gated action (see NotificationBell's "Enable
 * notifications" button) since browsers require a user gesture and
 * showing the native permission prompt unprompted is bad practice. */
export function PushRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return; // unsupported browser — fail gracefully, no error shown
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail (e.g. insecure context in some dev setups) —
      // this is non-fatal, push simply won't be available this session.
    });
  }, []);

  return null;
}
