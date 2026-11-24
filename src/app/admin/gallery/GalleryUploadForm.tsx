"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addGalleryImage } from "@/lib/actions/catalogue";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

const GALLERY_IMAGE_SIDE = 1200;
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_OPTIMIZED_IMAGE_BYTES = 650 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type GalleryPreview = { url: string; type: "image" | "video" };

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not optimize this photo. Please try another image."));
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not prepare this photo for upload."));
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(blob);
  });
}

async function prepareGalleryImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("Please choose a JPG, PNG or WEBP photo.");
  }
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("The original photo must be 15 MB or smaller.");
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = GALLERY_IMAGE_SIDE;
    canvas.height = GALLERY_IMAGE_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is not available in this browser.");

    context.fillStyle = "#f8f5ef";
    context.fillRect(0, 0, GALLERY_IMAGE_SIDE, GALLERY_IMAGE_SIDE);
    const scale = Math.min(GALLERY_IMAGE_SIDE / bitmap.width, GALLERY_IMAGE_SIDE / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    context.drawImage(
      bitmap,
      Math.round((GALLERY_IMAGE_SIDE - width) / 2),
      Math.round((GALLERY_IMAGE_SIDE - height) / 2),
      width,
      height,
    );

    let quality = 0.84;
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") {
      throw new Error("This browser cannot optimize gallery photos. Please use a recent browser.");
    }
    while (blob.size > MAX_OPTIMIZED_IMAGE_BYTES && quality > 0.5) {
      quality = Math.max(0.5, quality - 0.08);
      blob = await canvasToBlob(canvas, "image/webp", quality);
    }
    if (blob.size > MAX_OPTIMIZED_IMAGE_BYTES) {
      throw new Error("This photo is still too large after optimization. Please choose a smaller image.");
    }
    return await blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}

export function GalleryUploadForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GalleryPreview | null>(null);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setPreview(null);

    try {
      if (file.type.startsWith("image/")) {
        const url = await prepareGalleryImage(file);
        setPreview({ url, type: "image" });
        return;
      }

      if (!file.type.startsWith("video/")) {
        throw new Error("Please choose a supported photo or video.");
      }
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Video upload failed.");
      setPreview({ url: data.url, type: "video" });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!preview) {
      setError("Please choose a photo or video first.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await addGalleryImage({
        category,
        mediaUrl: preview.url,
        mediaType: preview.type,
        caption: caption || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(null);
      setCaption("");
      router.refresh();
    } catch {
      setError("Could not save this gallery item. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg text-ink">Add to gallery</h2>
      <div className="mt-4 space-y-3">
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Photo or video</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            onChange={(event) => handleFile(event.target.files)}
            disabled={uploading}
            className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-sm file:border-0 file:bg-bronze-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-bronze-600"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            Photos are fitted without cropping to a square 1200 × 1200 px WEBP and optimized to 650 KB or less.
            The same square display size is used on the website.
          </p>
          {uploading && <p className="mt-1 text-xs text-ink-soft">Preparing…</p>}
          {preview && (
            preview.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="Optimized gallery preview" className="mt-2 h-32 w-32 rounded-card object-cover" />
            ) : (
              <video src={preview.url} controls className="mt-2 h-32 w-32 rounded-card object-cover" />
            )
          )}
        </div>
        <Input label="Caption (optional)" value={caption} onChange={(event) => setCaption(event.target.value)} />
        {error && <p className="text-sm text-rust">{error}</p>}
        <Button onClick={handleSave} className="w-full" loading={uploading}>
          Add to gallery
        </Button>
      </div>
    </Card>
  );
}
