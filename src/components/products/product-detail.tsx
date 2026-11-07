"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, ShieldCheck, Truck } from "lucide-react";

import { ProductGallery } from "@/components/products/product-gallery";
import { ProductPurchasePanel } from "@/components/products/product-purchase-panel";
import { formatPrice } from "@/lib/site";
import { isGlassBanglesCategory } from "@/lib/product-sizes";
import type { Product, ProductImage } from "@/types";

interface ProductDetailProps {
  product: Product;
  whatsappNumber: string | null;
  siteUrl: string;
  freeShippingThreshold: number | null;
}

/**
 * Client shell for the product page buy area.
 *
 * Colour selection is shared between the gallery and the purchase panel so
 * that picking a colour (or a colour thumbnail) swaps the main image. Split
 * Glass Bangles products have a single colour, so the selector stays hidden.
 */
export function ProductDetail({
  product,
  whatsappNumber,
  siteUrl,
  freeShippingThreshold,
}: ProductDetailProps) {
  const [colour, setColour] = useState<string | null>(product.colours[0] ?? null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const colourImageMap = useMemo(
    () =>
      new Map(
        (product.colour_images ?? []).map((ci) => [ci.colour.toLowerCase(), ci.image_url]),
      ),
    [product.colour_images],
  );

  const galleryImages = useMemo<ProductImage[]>(() => {
    const result: ProductImage[] = [];
    const seen = new Set<string>();

    function add(imageUrl: string | null, altText: string) {
      if (!imageUrl || seen.has(imageUrl)) return;
      seen.add(imageUrl);
      result.push({
        id: `${product.id}-image-${result.length}`,
        product_id: product.id,
        image_url: imageUrl,
        storage_path: null,
        alt_text: altText || product.name,
        sort_order: result.length,
      });
    }

    // The catalogue stores one headlining photo per product (`primary_image_url`)
    // while the legacy `product_images` table is often empty. Always seed the
    // gallery with the primary shot so the detail page never falls back to the
    // neutral placeholder when a real photo exists.
    add(product.primary_image_url, product.name);
    for (const image of product.images ?? []) add(image.image_url, image.alt_text);
    for (const ci of product.colour_images ?? []) {
      add(ci.image_url, `${product.name} — ${ci.colour}`);
    }

    return result;
  }, [
    product.id,
    product.name,
    product.primary_image_url,
    product.images,
    product.colour_images,
  ]);

  function handleColourChange(next: string) {
    setColour(next);
    setSelectedImageUrl(colourImageMap.get(next.toLowerCase()) ?? null);
  }

  function handleSelectImage(url: string) {
    setSelectedImageUrl(url);
    const match = (product.colour_images ?? []).find((ci) => ci.image_url === url);
    if (match) setColour(match.colour);
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
      <ProductGallery
        images={galleryImages}
        name={product.name}
        selectedImageUrl={selectedImageUrl}
        onSelectImage={handleSelectImage}
      />

      <div className="flex flex-col gap-6">
        <div>
          {product.category ? (
            <Link
              href={`/collections/${product.category.slug}`}
              className="text-xs uppercase tracking-[0.16em] text-gold-strong hover:underline"
            >
              {product.category.name}
            </Link>
          ) : null}
          <h1 className="mt-2 font-display text-2xl leading-tight text-foreground sm:text-3xl">
            {product.name}
          </h1>
        </div>

        <ProductPurchasePanel
          product={product}
          whatsappNumber={whatsappNumber}
          siteUrl={siteUrl}
          colour={colour}
          onColourChange={handleColourChange}
        />

        <dl className="grid grid-cols-1 gap-2 border-t border-border pt-5 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Product code</dt>
            <dd className="text-foreground">{product.sku ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Category</dt>
            <dd className="text-foreground">{product.category_name ?? "—"}</dd>
          </div>
          {isGlassBanglesCategory(product.category_name) && product.colours.length > 0 ? (
            <div className="flex gap-2 sm:col-span-2">
              <dt className="text-muted-foreground">
                {product.colours.length > 1 ? "Colours" : "Colour"}
              </dt>
              <dd className="capitalize text-foreground">{product.colours.join(", ")}</dd>
            </div>
          ) : null}
        </dl>

        <ul className="grid gap-3 sm:grid-cols-3">
          <li className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <Truck className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />
            <span>
              {freeShippingThreshold
                ? `Free delivery above ${formatPrice(freeShippingThreshold)} within India`
                : "Delivery confirmed on enquiry"}
            </span>
          </li>
          <li className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <RefreshCw className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />
            <span>Handmade to order in 5–7 days</span>
          </li>
          <li className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-strong" aria-hidden="true" />
            <span>Authentic quality, handcrafted with love</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
