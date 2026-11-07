import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { validateCartItems } from "@/lib/cart/validate";
import { getCatalog } from "@/lib/data";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay/client";
import { getShippingFee } from "@/lib/site";
import { getCustomerIdentity } from "@/lib/auth/auth-utils";
import { enquirySchema } from "@/lib/validation/enquiry";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface OrderCustomer {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  pincode: string | null;
  state: string | null;
}

interface CreateOrderBody {
  items: unknown;
  customer?: Partial<OrderCustomer> | null;
  note?: string | null;
}

function buildVariantLabel(line: { variantLabel: string | null; size: string | null; colour: string | null }): string | null {
  const parts = [line.variantLabel, line.size ? `Size: ${line.size}` : null, line.colour ? `Colour: ${line.colour}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function POST(request: Request) {
  try {
    return await handleCreateOrder(request);
  } catch (err) {
    console.error("Unexpected checkout error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not process your order. Please try again." },
      { status: 500 },
    );
  }
}

async function handleCreateOrder(request: Request) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Online payments are not configured yet. Please contact us." },
      { status: 503 },
    );
  }

  const limit = rateLimit(`razorpay-create-order:${clientKey(request)}`, 15, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const customerIdentity = await getCustomerIdentity();

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
  const purchasable = result.purchasable;
  if (purchasable.length === 0) {
    return NextResponse.json(
      { error: "None of the items in your bag are currently available.", issues: result.issues },
      { status: 409 },
    );
  }

  const catalog = await getCatalog();
  const settings = await catalog.getSettings();
  const bodyTyped = body as CreateOrderBody;
  const customer = bodyTyped.customer ?? {};

  const customerName = typeof customer.name === "string" ? customer.name.trim() || null : null;
  const customerEmail = typeof customer.email === "string" ? customer.email.trim() || null : null;
  const customerPhone =
    typeof customer.phone === "string" ? customer.phone.trim() || null : null;
  const shippingAddress =
    typeof customer.address === "string" ? customer.address.trim() || null : null;
  const customerPincode =
    typeof customer.pincode === "string" ? customer.pincode.trim() || null : null;
  const customerState =
    typeof customer.state === "string" ? customer.state.trim() || null : null;

  if (!customerName || !customerPhone || !shippingAddress || !customerPincode) {
    return NextResponse.json(
      { error: "Name, phone, delivery address and PIN code are required." },
      { status: 400 },
    );
  }

  // Subtotal from authoritative server-side prices (never trust client totals).
  const subtotal = result.subtotal; // rupees, 2 dp
  const subtotalPaise = Math.round(subtotal * 100);
  const shippingFeeRupees = getShippingFee(
    subtotal,
    settings.free_shipping_threshold,
    settings,
    customerState === "Tamil Nadu",
  );

  const shippingFeePaise = Math.round(shippingFeeRupees * 100);
  const discountPaise = 0;
  const totalPaise = subtotalPaise - discountPaise + shippingFeePaise;
  if (totalPaise <= 0) {
    return NextResponse.json({ error: "Order total must be greater than zero." }, { status: 400 });
  }

  // 1. Internal order record (pending payment).
  let order: { id: string; order_number: string };
  try {
  const created = await getCatalog().createOrder({
    customerId: customerIdentity?.userId ?? null,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress: shippingAddress,
    customerPincode,
    customerState,
    notes: parsed.data.note ?? null,
    currency: settings.currency,
    subtotal,
    items: purchasable.map((line) => ({
      productId: line.productId,
      productName: line.name,
      variant: buildVariantLabel(line),
      variantId: line.variantId,
      colour: line.colour,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? 0,
    })),
  });
    order = { id: created.id, order_number: created.order_number };
  } catch (err) {
    console.error("Order creation error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not create your order.", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // 2. Razorpay order (server-side).
  let razorpayOrder: { id: string; amount: number; currency: string };
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise: totalPaise,
      currency: "INR",
      receipt: order.order_number,
      notes: {
        internal_order_id: order.id,
        customer_name: customerName ?? "",
        customer_phone: customerPhone ?? "",
      },
    });
  } catch (err) {
    console.error("Razorpay order creation error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not initialise payment.", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // 3. Attach payment details to the internal order.
  const supabase = getServiceRoleClient();
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      razorpay_order_id: razorpayOrder.id,
      payment_status: "pending",
      customer_email: customerEmail ?? null,
      shipping_address: shippingAddress ?? null,
      shipping_pincode: customerPincode ?? null,
      shipping_fee_paise: shippingFeePaise,
      discount_paise: discountPaise,
      total_amount: totalPaise / 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not save payment details. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID ?? null,
      orderNumber: order.order_number,
      internalOrderId: order.id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
