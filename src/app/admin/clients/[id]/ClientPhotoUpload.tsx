"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { addClientPhoto } from "@/lib/actions/crm";

export function ClientPhotoUpload({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [photoType, setPhotoType] = useState<"before" | "after" | "inspiration" | "service">("service");
  const [visibility, setVisibility] = useState<"private_staff" | "assigned_stylist_only" | "public">("private_staff");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      const res = await fetch("/api/upload/client-photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");

      const result = await addClientPhoto({ clientId, url: data.url, photoType, visibility });
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Type" value={photoType} onChange={(e) => setPhotoType(e.target.value as typeof photoType)}>
          <option value="before">Before</option>
          <option value="after">After</option>
          <option value="inspiration">Inspiration</option>
          <option value="service">Service</option>
        </Select>
        <Select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
          <option value="private_staff">Private (staff only)</option>
          <option value="assigned_stylist_only">Assigned stylist only</option>
          <option value="public">Public (needs approval)</option>
        </Select>
      </div>
      <label>
        <span className="sr-only">Upload photo</span>
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="text-xs" />
      </label>
      {uploading && <p className="text-xs text-ink-soft">Uploading…</p>}
      {error && <p className="text-xs text-rust">{error}</p>}
    </div>
  );
}
