import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { validateCartItems } from "@/lib/cart/validate";
import { getCatalog } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { enquirySchema } from "@/lib/validation/enquiry";
import { buildOrderEnquiryUrl, DEFAULT_CLOSING } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Builds the WhatsApp enquiry link for a bag.
 *
 * Prices, names and availability are all re-resolved from the catalogue before
 * the message is composed, so a tampered client cannot change what the enquiry
 * says. The response is a link only — the server never claims an order was
 * placed or paid for.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`order-enquiry:${clientKey(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many enquiries. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cart payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await validateCartItems(parsed.data.items);

  if (result.purchasable.length === 0) {
    return NextResponse.json(
      {
        error: "None of the items in your bag are currently available.",
        issues: result.issues,
      },
      { status: 409 },
    );
  }

  const settings = await getCatalog().getSettings();

  const url = buildOrderEnquiryUrl({
    storeName: settings.store_name,
    whatsappNumber: settings.whatsapp_number,
    siteUrl: SITE_URL,
    closing: parsed.data.note
      ? `${parsed.data.note}\n${DEFAULT_CLOSING}`
      : undefined,
    items: result.purchasable.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? 0,
      variantLabel: line.variantLabel,
      sku: line.sku,
      size: line.size,
      colour: line.colour,
      url: line.slug ? `${SITE_URL}/#product-${line.slug}` : null,
    })),
  });

  if (!url) {
    return NextResponse.json(
      { error: "WhatsApp ordering is not configured yet. Please contact us another way." },
      { status: 503 },
    );
  }

  // Best-effort record of the enquiry so the admin panel can follow up. A
  // storage failure must never stop the customer reaching WhatsApp, so any
  // error is swallowed after the link is built.
  try {
    await getCatalog().createOrder({
      customerId: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      customerPincode: null,
      customerAddress: null,
      customerState: null,
      notes: parsed.data.note,
      currency: settings.currency,
      subtotal: result.subtotal,
      items: result.purchasable.map((line) => ({
        productId: line.productId,
        productName: line.name,
        variant:
          [
            line.variantLabel,
            line.size ? `Size: ${line.size}` : null,
            line.colour ? `Colour: ${line.colour}` : null,
          ]
            .filter(Boolean)
            .join(", ") || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? 0,
      })),
    });
  } catch {
    // Recording is optional; ignore and continue.
  }

  return NextResponse.json(
    { url, subtotal: result.subtotal, issues: result.issues },
    { headers: { "Cache-Control": "no-store" } },
  );
}
