import { Buffer } from "node:buffer";

export const GALLERY_IMAGE_DATA_URL_PREFIX = "data:image/webp;base64,";
export const GALLERY_IMAGE_STORAGE_PREFIX = "db-image:webp-base64:";
export const MAX_GALLERY_IMAGE_BYTES = 650 * 1024;
export const MAX_GALLERY_IMAGE_DATA_URL_LENGTH =
  GALLERY_IMAGE_DATA_URL_PREFIX.length + Math.ceil(MAX_GALLERY_IMAGE_BYTES / 3) * 4;

function decodeWebpBase64(base64: string): Buffer | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    return null;
  }

  const bytes = Buffer.from(base64, "base64");
  if (
    bytes.length < 12 ||
    bytes.length > MAX_GALLERY_IMAGE_BYTES ||
    bytes.toString("base64") !== base64 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  return bytes;
}

export function decodeGalleryImageDataUrl(dataUrl: string): Buffer | null {
  if (!dataUrl.startsWith(GALLERY_IMAGE_DATA_URL_PREFIX)) return null;
  return decodeWebpBase64(dataUrl.slice(GALLERY_IMAGE_DATA_URL_PREFIX.length));
}

export function decodeStoredGalleryImage(mediaUrl: string): Buffer | null {
  if (!mediaUrl.startsWith(GALLERY_IMAGE_STORAGE_PREFIX)) return null;
  return decodeWebpBase64(mediaUrl.slice(GALLERY_IMAGE_STORAGE_PREFIX.length));
}
