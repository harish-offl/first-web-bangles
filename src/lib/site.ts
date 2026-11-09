import type { StoreSettings } from "@/types";

/**
 * Business facts transcribed from the live legacy site (banglesbybeauty.com)
 * during the Stage 1 audit. Nothing here is invented: every value was read
 * from the original pages. Anything the owner has never published is `null`
 * rather than a guess, and the UI renders an explicit "pending" state for it.
 */
export const LEGACY_FACTS = {
  brandName: "Bangles by Beauty",
  tagline: "Crafted for Every Occasion",
  location: "Pattukottai",
  whatsappNumber: "916381137076",
  freeDeliveryThreshold: 2499,
  announcement:
    "Free delivery on orders above ₹2499 · Handcrafted with love from Pattukottai",
  heroEyebrow: "Handcrafted in Pattukottai",
  heroHeading: "Crafted for Every Occasion",
  heroBody:
    "From bridal bangles to everyday elegance — handcrafted jewellery that tells your story, made with love in Pattukottai.",
  supportHours: "10AM – 7PM",
  processingNote: "Made to order · 5 to 7 days processing",
  social: {
    facebook: "https://www.facebook.com/share/1Csucpqcd4/",
    instagram: "https://www.instagram.com/bangles_by_beauty?igsh=MnJienJqMWludTNz",
    youtube: "https://youtube.com/%40bangles_by_beauty?si=WI2bStYuMaPkxQxy",
  },
  /** No Pinterest profile was published; only the bare domain was linked. */
  pinterest: null,
/** The business contact email address. */
  contactEmail: "banglesbybeauty@gmail.com",
  mapUrl: "https://www.openstreetmap.org/directions?to=Pattukkottai",
  legacyUrl: "https://banglesbybeauty.com/",
} as const;

export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: LEGACY_FACTS.brandName,
  whatsapp_number: LEGACY_FACTS.whatsappNumber,
  contact_email: LEGACY_FACTS.contactEmail,
  currency: "INR",
  announcement: LEGACY_FACTS.announcement,
  shipping_info:
    "Made to order with a processing time of 5 to 7 days. Free delivery on orders above ₹2499.",
  footer_note: "Handcrafted with love from Pattukottai.",
  facebook_url: LEGACY_FACTS.social.facebook,
  instagram_url: LEGACY_FACTS.social.instagram,
  youtube_url: LEGACY_FACTS.social.youtube,
  pinterest_url: LEGACY_FACTS.pinterest,
  location: LEGACY_FACTS.location,
  seo_title_template: "%s · Bangles by Beauty",
  seo_default_description:
    "Handcrafted bangles, bridal sets and traditional jewellery from Pattukottai. Shop border bangles, bridal bangles, kundan hair bands and more.",
  free_shipping_threshold: LEGACY_FACTS.freeDeliveryThreshold,
  delivery_fee_tn: 60,
  delivery_fee_outside_tn: 100,
};

const FALLBACK_SITE_URL =
  process.env.NODE_ENV === "production"
    ? "https://www.banglesbybeauty.in"
    : "http://localhost:3000";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL
).replace(/\/$/, "");

export const SITE_NAME = DEFAULT_SETTINGS.store_name;

/**
 * Standard delivery fee in whole rupees, charged on orders whose subtotal is
 * below the configured free-delivery threshold. Kept as a single shared
 * constant so the cart, checkout and server-side order total never disagree.
 */
export const STANDARD_SHIPPING_FEE = 60;

/** Subtotal (in rupees) at or above which delivery is free. */
export const FREE_SHIPPING_THRESHOLD = LEGACY_FACTS.freeDeliveryThreshold;

/**
 * Authoritative shipping rule used by both the UI and the payment API.
 * Delivery is free at or above the threshold; otherwise the standard fee
 * applies. A `null` threshold means no free-delivery promotion is configured.
 *
 * @param subtotal - Cart subtotal in rupees.
 * @param freeShippingThreshold - Threshold for free delivery (null = disabled).
 * @param settings - Store settings containing delivery_fee_tn and delivery_fee_outside_tn.
 * @param isInsideTamilNadu - Whether the delivery address is inside Tamil Nadu.
 */
export function getShippingFee(
  subtotal: number,
  freeShippingThreshold: number | null,
  settings: Pick<StoreSettings, "delivery_fee_tn" | "delivery_fee_outside_tn">,
  isInsideTamilNadu: boolean = true,
): number {
  if (
    freeShippingThreshold !== null &&
    freeShippingThreshold > 0 &&
    subtotal >= freeShippingThreshold
  ) {
    return 0;
  }
  const fee = isInsideTamilNadu
    ? settings.delivery_fee_tn ?? STANDARD_SHIPPING_FEE
    : settings.delivery_fee_outside_tn ?? STANDARD_SHIPPING_FEE;
  return fee ?? STANDARD_SHIPPING_FEE;
}

/** Admin routes are excluded from indexing. */
export const PROTECTED_ROUTES = ["/admin"];

export const CURRENCY_SYMBOL = "₹";

export function formatPrice(value: number, currency = "INR"): string {
  if (!Number.isFinite(value)) return "—";
  const symbol = currency === "INR" ? CURRENCY_SYMBOL : "";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${symbol}${formatted}`;
}
