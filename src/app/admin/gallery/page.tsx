import { db } from "@/db";
import { galleryImages } from "@/db/schema";
import { desc } from "drizzle-orm";
import { EmptyState } from "@/components/ui/EmptyState";
import { GalleryUploadForm } from "./GalleryUploadForm";
import { GalleryGrid } from "./GalleryGrid";
import { GALLERY_CATEGORIES } from "./constants";

export default async function AdminGalleryPage() {
  const images = await db.select().from(galleryImages).orderBy(desc(galleryImages.createdAt));

  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Gallery</h1>
      <p className="mt-1 max-w-lg text-sm text-ink-soft">
        Photos and videos shown on the homepage gallery, organized by category.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {images.length === 0 ? (
            <EmptyState title="No gallery images yet" description="Upload your first photo to get started." />
          ) : (
            <GalleryGrid
              images={images.map((i) => ({
                id: i.id,
                category: i.category,
                mediaUrl: i.mediaUrl,
                mediaType: i.mediaType,
                caption: i.caption,
              }))}
            />
          )}
        </div>
        <GalleryUploadForm categories={GALLERY_CATEGORIES} />
      </div>
    </div>
  );
}
