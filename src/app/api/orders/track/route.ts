import { NextResponse } from "next/server";

import { getServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import { normaliseWhatsAppNumber } from "@/lib/whatsapp/shared";
import {
  DEFAULT_STATUS_MESSAGES,
  ORDER_STATUS_LABELS,
  statusToDeliveryStage,
} from "@/lib/orders/lifecycle";
import type { OrderStatus } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/track?order_number=BB-2611-00001
 *
 * Public lookup by order number plus the phone number used at checkout.
 * Order numbers are short and sequential, so the phone number is required as
 * a second factor before any customer or address details are returned.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = (searchParams.get("order_number") || "").trim().toUpperCase();
  const contact = (
    request.headers.get("x-order-contact") ||
    searchParams.get("contact") ||
    ""
  ).trim();

  if (!orderNumber) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  const contactDigits = contact.replace(/\D/g, "");
  if (contactDigits.length < 10) {
    return NextResponse.json(
      { error: "Enter the 10-digit phone number used at checkout." },
      { status: 400 },
    );
  }

  if (!/^BB-\d{4}-\d{4,5}$/.test(orderNumber)) {
    return NextResponse.json(
      { error: "Invalid Order ID format. Use format like BB-2611-00001." },
      { status: 400 },
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Order tracking is not configured for this deployment." },
      { status: 500 },
    );
  }

  try {
    const supabase = getServiceRoleClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const storedPhone = normaliseWhatsAppNumber(order.customer_phone);
    const contactPhone = normaliseWhatsAppNumber(contact);

    if (!storedPhone || !contactPhone || storedPhone !== contactPhone) {
      return NextResponse.json(
        { error: "Phone number does not match the one used at checkout." },
        { status: 404 },
      );
    }

    const [{ data: items, error: itemsError }, { data: history, error: historyError }] =
      await Promise.all([
        supabase
          .from("order_items")
          .select(
            "id, product_id, product_name_snapshot, selected_variant_snapshot, colour, size, quantity, unit_price, line_total",
          )
          .eq("order_id", order.id),
        supabase
          .from("order_status_history")
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: true }),
      ]);

    if (itemsError) throw new Error(itemsError.message);
    if (historyError) throw new Error(historyError.message);

    const productIds = (items ?? [])
      .map((item) => item.product_id)
      .filter((value): value is string => Boolean(value));
    const productImages = new Map<string, string | null>();
    if (productIds.length) {
      const { data: products } = await supabase
        .from("products")
        .select("id, primary_image_url")
        .in("id", productIds);
      for (const product of products ?? []) {
        productImages.set(product.id, product.primary_image_url);
      }
    }

    const status = order.status as OrderStatus;
    const trackingEvents = (history ?? []).map((event) => ({
      id: event.id,
      status: event.new_status,
      description:
        event.customer_message ||
        DEFAULT_STATUS_MESSAGES[event.new_status as OrderStatus] ||
        ORDER_STATUS_LABELS[event.new_status] ||
        "Order status updated.",
      location: null,
      created_at: event.created_at,
      tracking_number: event.tracking_number,
      courier_name: event.courier_name,
      tracking_url: event.tracking_url,
    }));

    return NextResponse.json(
      {
        order_number: order.order_number,
        status,
        delivery_stage: order.delivery_stage ?? statusToDeliveryStage(status),
        courier_name: order.courier_name ?? order.courier_partner,
        tracking_number: order.tracking_number ?? order.tracking_id,
        tracking_updated_at: order.tracking_updated_at,
        courier_tracking_url: order.courier_tracking_url,
        payment_status: order.payment_status ?? "pending",
        currency: order.currency,
        subtotal: order.subtotal,
        shipping_fee_paise: order.shipping_fee_paise ?? 0,
        discount_paise: order.discount_paise ?? 0,
        total_amount: order.total_amount,
        estimated_delivery: order.estimated_delivery,
        shipped_at: order.shipped_at,
        delivered_at: order.delivered_at,
        created_at: order.created_at,
        shipping_address: order.shipping_address,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        items: (items ?? []).map((item) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name_snapshot,
          variant: item.selected_variant_snapshot,
          colour: item.colour,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          product_image: item.product_id ? productImages.get(item.product_id) ?? null : null,
        })),
        tracking_events: trackingEvents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Order tracking error:", error);
    return NextResponse.json(
      { error: "Unable to fetch order tracking. Please try again later." },
      { status: 500 },
    );
  }
}
