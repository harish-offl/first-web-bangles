const LOCAL_DISK_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\)/;
const SUPABASE_BUCKET = "product-images";
const STORAGE_PREFIXES = ["product-images/", "products/", "uploads/", "custom-designs/"];

function supabasePublicUrl(storagePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return null;

  const cleaned = storagePath.replace(/^\/+/, "");
  const withoutBucket = cleaned.startsWith(`${SUPABASE_BUCKET}/`)
    ? cleaned.slice(SUPABASE_BUCKET.length + 1)
    : cleaned;

  return `${base}/storage/v1/object/public/${SUPABASE_BUCKET}/${withoutBucket}`;
}

/**
 * Normalises a database/form image reference into something next/image can use.
 *
 * Accepts absolute HTTP(S) URLs, root-relative public paths, and bare Supabase
 * Storage object paths (for example `products/foo.jpg`). Returns `null` for
 * empty, malformed, data-less or local-disk values so callers can render the
 * catalogue placeholder instead of a broken image.
 */
export function normalizeImageSource(src: unknown): string | null {
  if (typeof src !== "string") return null;

  const value = src.trim();
  if (!value) return null;

  if (value.startsWith("data:")) return value;
  if (LOCAL_DISK_PATTERN.test(value)) return null;

  if (value.startsWith("//")) return `https:${value}`;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      return new URL(value).href;
    } catch {
      return null;
    }
  }

  if (value.startsWith("/")) return value;

  const cleaned = value.replace(/^\/+/, "");
  if (STORAGE_PREFIXES.some((prefix) => cleaned.startsWith(prefix))) {
    const resolved = supabasePublicUrl(cleaned);
    if (resolved) return resolved;
  }

  // Anything else is treated as a public path relative to the site root.
  return `/${cleaned}`;
}
