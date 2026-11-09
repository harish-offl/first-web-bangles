import type { CartLine } from "@/stores/cart-store";

import { getSizeSurcharge, isBangleCategory } from "@/lib/product-sizes";
import type { Product, ProductVariant } from "@/types";

interface ToCartLineOptions {
  quantity?: number;
  variant?: ProductVariant | null;
  /** Selected bangle size; ignored for non-bangle products. */
  size?: string | null;
  /** Selected colour option. */
  colour?: string | null;
}

/**
 * Maps a catalogue product (and optional variant) onto a cart line.
 *
 * The unit price stored here is only a display convenience for the client —
 * `/api/order-enquiry` re-reads the catalogue and rebuilds the enquiry from
 * server-side prices before anything is sent to WhatsApp.
 */
export function toCartLine(product: Product, options: ToCartLineOptions = {}): CartLine {
  const { quantity = 1, variant = null, size = null, colour = null } = options;
  const appliesSize = isBangleCategory(product.category_name);
  const surcharge = appliesSize ? getSizeSurcharge(size) : 0;
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    imageUrl: variant?.image_url ?? product.primary_image_url ?? null,
    sku: variant?.sku ?? product.sku ?? null,
    unitPrice: (variant?.price_override ?? product.price) + surcharge,
    variantId: variant?.id ?? null,
    variantLabel: variant ? `${variant.variant_name}: ${variant.variant_value}` : null,
    size: appliesSize ? size : null,
    colour: colour ?? null,
    quantity: Math.max(1, quantity),
  };
}
