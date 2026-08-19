"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addGalleryImage } from "@/lib/actions/catalogue";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export function GalleryUploadForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: "image" | "video" } | null>(null);

  async function handleFile(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", files[0]);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) return setError(data.error || "Upload failed.");
    const type = files[0].type.startsWith("video") ? "video" : "image";
    setPreview({ url: data.url, type });
  }

  async function handleSave() {
    if (!preview) {
      setError("Please choose a photo or video first.");
      return;
    }
    setUploading(true);
    setError(null);
    const result = await addGalleryImage({
      category,
      mediaUrl: preview.url,
      mediaType: preview.type,
      caption: caption || undefined,
    });
    setUploading(false);
    if (!result.ok) return setError(result.error);
    setPreview(null);
    setCaption("");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg text-ink">Add to gallery</h2>
      <div className="mt-4 space-y-3">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Photo or video</span>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => handleFile(e.target.files)}
            className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-sm file:border-0 file:bg-bronze-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-bronze-600"
          />
          {uploading && <p className="mt-1 text-xs text-ink-soft">Uploading…</p>}
          {preview && (
            preview.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="Preview" className="mt-2 h-32 w-32 rounded-card object-cover" />
            ) : (
              <video src={preview.url} controls className="mt-2 h-32 w-32 rounded-card object-cover" />
            )
          )}
        </div>
        <Input label="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
        {error && <p className="text-sm text-rust">{error}</p>}
        <Button onClick={handleSave} className="w-full" loading={uploading}>
          Add to gallery
        </Button>
      </div>
    </Card>
  );
}
