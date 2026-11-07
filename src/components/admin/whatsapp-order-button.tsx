"use client";

import { MessageCircle, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Order } from "@/types";
import {
  ORDER_STATUS_LABELS,
} from "@/lib/orders/lifecycle";
import { buildWhatsAppUrl, normaliseWhatsAppNumber } from "@/lib/whatsapp/shared";

interface WhatsAppOrderButtonProps {
  order: Order;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function WhatsAppOrderButton({ order }: WhatsAppOrderButtonProps) {
  const hasPhone = Boolean(normaliseWhatsAppNumber(order.customer_phone));

  const buildMessage = (): string => {
    const items = order.items ?? [];
    const itemLines = items.map((item) => {
      const variant = item.selected_variant_snapshot ? ` (${item.selected_variant_snapshot})` : "";
      return `- ${item.product_name_snapshot}${variant} × ${item.quantity}`;
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.banglesbybeauty.in";
    const trackingUrl = `${siteUrl}/track-order`;

    const statusKey = order.status as string;
    const statusLabel = ORDER_STATUS_LABELS[statusKey] ?? statusKey;

    let body = "";
    switch (statusKey) {
      case "pending":
        body = `Hello ${order.customer_name ?? "Customer"}!

Thank you for shopping with Bangles by Beauty.

Your order has been received successfully.

Order ID: ${order.order_number}
Product(s): ${itemLines.join("\n")}
Total: ₹${order.total_amount}

We will confirm your order shortly and start processing your bangles.

Thank you for choosing Bangles by Beauty!`;
        break;
      case "confirmed":
        body = `Hello ${order.customer_name ?? "Customer"}!

Thank you for shopping with Bangles by Beauty.

Your order has been confirmed successfully.

Order ID: ${order.order_number}
Product(s): ${itemLines.join("\n")}
Total: ₹${order.total_amount}

We will update you when your order is packed and shipped.

Thank you for choosing Bangles by Beauty!`;
        break;
      case "processing":
        body = `Hello ${order.customer_name ?? "Customer"}!

Your order ${order.order_number} is currently being packed.

We will notify you once it has been shipped.

Thank you for shopping with Bangles by Beauty!`;
        break;
      case "shipped":
        body = `Hello ${order.customer_name ?? "Customer"}!

Great news! Your order ${order.order_number} has been shipped.

${order.courier_name ? `Courier: ${order.courier_name}\n` : ""}${order.tracking_number ? `Tracking ID: ${order.tracking_number}\n` : ""}${order.courier_tracking_url ? `Tracking Link: ${order.courier_tracking_url}\n` : ""}

You can use these details to follow your delivery.

Thank you!`;
        break;
      case "out_for_delivery":
        body = `Hello ${order.customer_name ?? "Customer"}!

Your order ${order.order_number} is out for delivery.

Please keep your phone available and ensure someone is available to receive the package.

Thank you for shopping with Bangles by Beauty!`;
        break;
      case "delivered":
        body = `Hello ${order.customer_name ?? "Customer"}!

Your order ${order.order_number} has been marked as delivered.

Thank you for shopping with Bangles by Beauty. We hope you love your purchase!`;
        break;
      case "cancelled":
        body = `Hello ${order.customer_name ?? "Customer"}!

Your order ${order.order_number} has been cancelled.

You will hear from us if any payment needs attention.

Thank you for shopping with Bangles by Beauty!`;
        break;
      default:
        body = `Hello ${order.customer_name ?? "Customer"}!

Greetings from Bangles by Beauty!

Order ID: ${order.order_number}
Order date: ${formatDate(order.created_at)}
Order status: ${statusLabel}

Items:
${itemLines.join("\n")}

Total: ₹${order.total_amount}

Track your order: ${trackingUrl}
Order ID: ${order.order_number}

Thank you for shopping with Bangles by Beauty!`;
    }

    return body;
  };

  const handleWhatsApp = () => {
    const url = buildWhatsAppUrl(order.customer_phone, buildMessage());
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!hasPhone}
            onClick={handleWhatsApp}
            aria-label={hasPhone ? "Send order details on WhatsApp" : "Customer phone unavailable"}
          >
            {hasPhone ? (
              <MessageCircle className="size-4 text-green-600" />
            ) : (
              <PhoneOff className="size-4" />
            )}
          </Button>
        }
      />
      <TooltipContent side="top">
        {hasPhone ? "Send order details on WhatsApp" : "Customer phone number not available"}
      </TooltipContent>
    </Tooltip>
  );
}
