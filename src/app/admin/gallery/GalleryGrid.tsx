"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGalleryImage } from "@/lib/actions/catalogue";
import { Button } from "@/components/ui/Button";

type GalleryItem = {
  id: string;
  category: string;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
};

export function GalleryGrid({ images }: { images: GalleryItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const byCategory = images.reduce<Record<string, GalleryItem[]>>((acc, img) => {
    (acc[img.category] ??= []).push(img);
    return acc;
  }, {});

  async function handleDelete(id: string) {
    setPendingId(id);
    await deleteGalleryImage(id);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category}>
          <p className="mb-2 text-xs uppercase tracking-wide2 text-ink-soft">{category}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((img) => (
              <div key={img.id} className="group relative">
                {img.mediaType === "video" ? (
                  <video src={img.mediaUrl} className="aspect-square w-full rounded-card object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.mediaUrl} alt={img.caption ?? category} className="aspect-square w-full rounded-card object-cover" />
                )}
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(img.id)}
                  loading={pendingId === img.id}
                  className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
