"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

import { normalizeImageSource } from "@/lib/images/url";
import { cn } from "@/lib/utils";

export const PLACEHOLDER_IMAGE = "/images/placeholder.jpg";

type ImageSource = ImageProps["src"];

interface SmartImageProps extends Omit<ImageProps, "src" | "alt"> {
  src?: ImageSource | null;
  alt: string;
  /** Letterbox the subject instead of cropping it (used for detail views). */
  contain?: boolean;
}

/**
 * `next/image` wrapper that swaps in the neutral catalogue placeholder when a
 * product has no photograph, so no layout ever renders a broken image.
 *
 * If an external image fails to load (404, 403, CORS, etc.) the component
 * falls back to the placeholder on the client so the page never shows a
 * broken-image icon. The failure is logged during development so real missing
 * objects can be fixed instead of silently hidden in production.
 *
 * Local file paths (e.g. C:\Users\...\image.png) are rejected because
 * next/image requires a configured URL hostname. They fall back to the
 * placeholder instead of crashing.
 */
export function SmartImage({
  src,
  alt,
  className,
  contain = false,
  onError,
  ...props
}: SmartImageProps) {
  const normalized = typeof src === "string" ? normalizeImageSource(src) : src;
  const resolved: ImageSource = normalized ?? PLACEHOLDER_IMAGE;
  const [failedSrc, setFailedSrc] = useState<ImageSource | null>(null);
  const failed = failedSrc === resolved;

  const handleError: NonNullable<ImageProps["onError"]> = (event) => {
    // Never retry on the placeholder itself to avoid infinite loops.
    if (resolved !== PLACEHOLDER_IMAGE && !failed) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[SmartImage] image failed to load", resolved);
      }
      setFailedSrc(resolved);
    }
    onError?.(event);
  };

  const finalSrc = failed ? PLACEHOLDER_IMAGE : resolved;

  return (
    <Image
      src={finalSrc}
      alt={alt}
      className={cn(contain && "object-contain", className)}
      onError={handleError}
      {...props}
    />
  );
}
