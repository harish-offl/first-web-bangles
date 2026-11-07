/**
 * Next.js image loader for the Bangles by Beauty storefront.
 *
 * Vercel's built-in image optimizer returns 402 once the project's image
 * optimisation allowance is exhausted, which makes product photography fail
 * even though the underlying files are healthy. This loader routes through the
 * app's own sharp-powered resize endpoint (`/api/image`) instead. That endpoint
 * only reads local `public/` files or allow-listed image hosts, and its output
 * is cached immutably at the CDN.
 */

export default function imageLoader({ src, width, quality }) {
  if (typeof src !== "string") return src;

  const value = src.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return value;
  if (value.startsWith("/api/image?")) return value;

  const params = new URLSearchParams();
  params.set("url", value);
  if (Number.isFinite(width) && width > 0) {
    params.set("w", String(Math.round(width)));
  }
  if (Number.isFinite(quality) && quality > 0) {
    params.set("q", String(Math.round(quality)));
  }

  return `/api/image?${params.toString()}`;
}
