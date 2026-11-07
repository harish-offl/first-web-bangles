import { formatPrice } from "@/lib/site";

/**
 * WhatsApp helpers with no server dependency, so both the server (order
 * enquiry route) and client components (floating chat button, footer) can
 * build consistent links.
 */

export interface WhatsAppCartItem {
  name: string;
  quantity: number;
  unitPrice: number;
  variantLabel?: string | null;
  sku?: string | null;
  /** Selected bangle size, e.g. "2.10". */
  size?: string | null;
  /** Selected colour option. */
  colour?: string | null;
  slug?: string;
  url?: string | null;
}

export interface WhatsAppMessageInput {
  storeName: string;
  items: WhatsAppCartItem[];
  siteUrl: string;
  /** Optional note appended after the line items, e.g. a delivery request. */
  closing?: string;
}

export const DEFAULT_CLOSING = "Please confirm availability and delivery details.";

/** Normalises Indian mobile numbers to WhatsApp international form. */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Drop international dialling prefixes and the Indian trunk prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;

  // Handles stored numbers with duplicated country codes such as 91 91 XXXXXXXXXX.
  if (digits.length > 10) {
    const local = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(local)) return `91${local}`;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Digits-only international number, or `null` when nothing valid is stored. */
export function whatsappDigits(raw: string | null | undefined): string | null {
  return normaliseWhatsAppNumber(raw);
}

/**
 * Builds the human-readable enquiry message. It deliberately says "enquire"
 * and asks the store to confirm — a WhatsApp click hands the bag over for
 * confirmation, it does not place or pay for an order.
 */
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const { storeName, items, siteUrl, closing = DEFAULT_CLOSING } = input;

  const lines: string[] = [];
  lines.push(`Hello ${storeName},`);
  lines.push("");
  lines.push("I would like to enquire about the following products:");
  lines.push("");

  let total = 0;
  let index = 0;

  for (const item of items) {
    index += 1;
    const subtotal = item.unitPrice * item.quantity;
    total += subtotal;

    lines.push(`${index}. ${item.name}`);
    if (item.variantLabel) lines.push(`   Variant: ${item.variantLabel}`);
    if (item.sku) lines.push(`   Code: ${item.sku}`);
    if (item.size) lines.push(`   Size: ${item.size}`);
    if (item.colour) lines.push(`   Colour: ${item.colour}`);
    lines.push(`   Quantity: ${item.quantity}`);
    lines.push(`   Unit price: ${formatPrice(item.unitPrice)}`);
    lines.push(`   Subtotal: ${formatPrice(subtotal)}`);
    if (item.url) lines.push(`   Link: ${item.url}`);
    lines.push("");
  }

  lines.push(`Estimated order total: ${formatPrice(total)}`);
  lines.push("");
  lines.push(closing);
  lines.push("");
  lines.push(`— sent from ${siteUrl}`);

  return lines.join("\n");
}

/**
 * Produces a WhatsApp click-to-chat URL. The message is fully encoded with
 * `encodeURIComponent`, and the number is international with no spaces.
 * Returns `null` when no number is configured so callers can disable the
 * action instead of shipping a broken contact link.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalised = normaliseWhatsAppNumber(phone);
  if (!normalised) return null;
  return `https://wa.me/${normalised}?text=${encodeURIComponent(message)}`;
}

export interface WhatsAppCustomDesignInput {
  storeName: string;
  siteUrl: string;
  size: string;
  colours: string[];
  customColour?: string | null;
  comments?: string | null;
  mobile: string;
  address: string;
  email: string;
  /** Public link to the uploaded reference photo, when one was stored. */
  imageUrl?: string | null;
  /** Fallback note when the photo could not be uploaded and must be attached by hand. */
  imageName?: string | null;
}

/**
 * Builds the custom-design brief as a WhatsApp message. A click-to-chat link
 * can only carry text, so the reference photo travels as a hosted link that
 * the store can open straight from the chat.
 */
export function buildCustomDesignMessage(input: WhatsAppCustomDesignInput): string {
  const {
    storeName,
    siteUrl,
    size,
    colours,
    customColour,
    comments,
    mobile,
    address,
    email,
    imageUrl,
    imageName,
  } = input;

  const colourList = [...colours];
  if (customColour) colourList.push(`${customColour} (custom)`);

  const lines: string[] = [];
  lines.push(`Hello ${storeName},`);
  lines.push("");
  lines.push("I would like to order a custom design.");
  lines.push("");
  lines.push(`Bangle size: ${size}`);
  lines.push(`Colours: ${colourList.length ? colourList.join(", ") : "To be advised"}`);
  if (comments) lines.push(`Design notes: ${comments}`);
  lines.push("");
  lines.push("My details:");
  lines.push(`Mobile: ${mobile}`);
  lines.push(`Email: ${email}`);
  lines.push(`Address: ${address}`);
  lines.push("");
  if (imageUrl) {
    lines.push("My design reference image:");
    lines.push(imageUrl);
  } else if (imageName) {
    lines.push(`I have a design reference image (${imageName}) to attach in this chat.`);
  } else {
    lines.push("I can share a design reference image in this chat if needed.");
  }
  lines.push("");
  lines.push("Please confirm the price and delivery time.");
  lines.push("");
  lines.push(`— sent from ${siteUrl}`);

  return lines.join("\n");
}

export interface WhatsAppReviewInput {
  storeName: string;
  siteUrl: string;
  rating: number;
  name: string;
  mobile: string;
  review: string;
  imageName?: string | null;
}

/**
 * Builds a customer review as a WhatsApp message. Photos cannot travel through
 * a click-to-chat link, so the message asks the customer to attach the photo in
 * the chat itself.
 */
export function buildReviewMessage(input: WhatsAppReviewInput): string {
  const { storeName, siteUrl, rating, name, mobile, review, imageName } = input;

  const stars = "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
  const lines: string[] = [];
  lines.push(`Hello ${storeName},`);
  lines.push("");
  lines.push("I would like to share a review.");
  lines.push("");
  lines.push(`Rating: ${stars} (${rating}/5)`);
  lines.push(`Name: ${name}`);
  lines.push(`Mobile: ${mobile}`);
  lines.push("");
  lines.push(`Review: ${review}`);
  lines.push("");
  if (imageName) {
    lines.push(`I have a photo (${imageName}) to attach in this chat.`);
  } else {
    lines.push("I can share a photo in this chat if needed.");
  }
  lines.push("");
  lines.push(`— sent from ${siteUrl}`);

  return lines.join("\n");
}
