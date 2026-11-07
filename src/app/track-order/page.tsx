"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  RefreshCw,
  Mail,
  MapPin,
  ShoppingBag,
} from "lucide-react";

import { SmartImage } from "@/components/shared/smart-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STATUS_MESSAGES,
  DELIVERY_STAGE_LABELS,
  ORDER_STATUS_LABELS,
  TRACKING_TIMELINE,
  orderStatusLabel,
  paymentStatusLabel,
  statusToDeliveryStage,
} from "@/lib/orders/lifecycle";
import type { OrderStatus } from "@/types";

const DELIVERY_STAGE_ORDER: string[] = [
  "order_placed",
  "order_confirmed",
  "packing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

interface OrderItem {
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_image: string | null;
}

interface TrackingData {
  order_number: string;
  status: string;
  delivery_stage: string | null;
  courier_name: string | null;
  courier_partner?: string | null;
  tracking_id?: string | null;
  tracking_updated_at: string | null;
  courier_tracking_url: string | null;
  payment_status: string | null;
  currency: string;
  subtotal: number;
  shipping_fee_paise: number;
  discount_paise: number;
  total_amount: number;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  tracking_number: string | null;
  shipping_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  items: OrderItem[];
  tracking_events: Array<{
    id: string;
    status: string;
    description: string | null;
    location: string | null;
    created_at: string;
    tracking_number?: string | null;
    courier_name?: string | null;
    tracking_url?: string | null;
  }>;
}

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ORDER_ID_REGEX = /^BB-\d{4}-\d{4,5}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTrackingData(null);

    const trimmed = orderNumber.trim();

    if (!trimmed) {
      setError("Please enter your Order ID.");
      return;
    }

    // Normalize: trim trailing periods/dots that may exist in stored order numbers
    const normalizedOrderNumber = trimmed.replace(/\.+$/, "");

    if (!ORDER_ID_REGEX.test(normalizedOrderNumber)) {
      setError("Invalid Order ID format. Use format like BB-2610-00001.");
      return;
    }

    const contactDigits = contact.replace(/\D/g, "");
    if (contactDigits.length < 10) {
      setError("Please enter the 10-digit phone number used at checkout.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/orders/track?order_number=${encodeURIComponent(normalizedOrderNumber)}`,
        { headers: { "x-order-contact": contact } },
      );
      if (res.status === 404) {
        const errorData = await res.json().catch(() => ({}));
        setError(
          errorData.error ||
            "Order not found. Please check your Order ID and the phone number used at checkout.",
        );
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Unable to fetch order tracking. Please try again later.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setTrackingData(data);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const formatPrice = (amount: number, currency: string = "INR"): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const deliveryStageIndex = (stage: string | null): number =>
    stage ? DELIVERY_STAGE_ORDER.indexOf(stage) : -1;

  const effectiveStage = trackingData
    ? (trackingData.delivery_stage ??
      statusToDeliveryStage(trackingData.status as OrderStatus))
    : null;
  const currentStageIndex = deliveryStageIndex(effectiveStage);

  const eventsByStatus = new Map<string, TrackingData["tracking_events"][number]>();
  for (const event of trackingData?.tracking_events ?? []) {
    if (!eventsByStatus.has(event.status)) eventsByStatus.set(event.status, event);
  }

  const isStageCompleted = (stage: string) =>
    currentStageIndex >= 0 && DELIVERY_STAGE_ORDER.indexOf(stage) <= currentStageIndex;

  const isStageCurrent = (stage: string) =>
    currentStageIndex >= 0 && DELIVERY_STAGE_ORDER.indexOf(stage) === currentStageIndex;

  if (!trackingData && !error && !loading) {
    return (
      <main className="container-page py-12 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Package className="size-6 text-brand-ink" />
            <h1 className="font-display text-2xl font-semibold text-brand-ink">
              Track Your Order
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg">
            Enter your Order ID and the phone number used at checkout to view order details
            and delivery progress.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="order_number">Order ID</Label>
              <Input
                id="order_number"
                name="order_number"
                type="text"
                placeholder="BB-2610-00001"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                className="text-brand-ink placeholder:text-brand-ink-soft"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Phone number</Label>
              <Input
                id="contact"
                name="contact"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Phone number used at checkout"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="text-brand-ink placeholder:text-brand-ink-soft"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold bg-brand-ink text-white hover:bg-brand-c100">
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="size-4 animate-spin" />
                  Tracking…
                </span>
              ) : (
                <>
                  Track My Order <ArrowRight className="size-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  if (error && !trackingData) {
    return (
      <main className="container-page py-12 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <Clock className="mx-auto size-12 text-destructive mb-4" />
          <h1 className="font-display text-2xl font-semibold text-brand-ink">
            Order not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => {
                setError(null);
              }}
              className="w-full sm:w-auto"
            >
              Try again
            </Button>
            <Link
              href="/shop"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-3 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-c100"
            >
              Browse the collection
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!trackingData) return null;

  return (
    <main className="container-page py-12 sm:py-20">
      <div className="max-w-3xl mx-auto">
        {/* ORDER HEADER */}
        <div className="rounded-lg border border-border bg-brand-c100 p-6 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Package className="size-6 text-brand-ink" />
              <h1 className="font-display text-2xl font-semibold text-brand-ink">
                Track Your Order
              </h1>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                trackingData.status === "delivered" || trackingData.status === "refunded"
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : ["cancelled", "delivery_failed", "stock_unavailable", "return_rejected"].includes(
                        trackingData.status,
                      )
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : "bg-brand-c100 text-brand-ink border border-brand-c300",
              )}
            >
              {orderStatusLabel(trackingData.status)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your order details and delivery updates
          </p>
        </div>

        {/* ORDER DETAILS */}
        <div className="grid gap-6 mb-8">
          <StatCard label="Order ID" value={trackingData.order_number} />
          <StatCard
            label="Order Date"
            value={formatDate(trackingData.created_at)}
          />
          <StatCard
            label="Order Status"
            value={orderStatusLabel(trackingData.status)}
          />
          <StatCard
            label="Delivery Stage"
            value={
              effectiveStage
                ? DELIVERY_STAGE_LABELS[effectiveStage] ?? effectiveStage
                : "Not Started"
            }
          />
          <StatCard
            label="Payment Status"
            value={paymentStatusLabel(trackingData.payment_status)}
          />
          <StatCard
            label="Total Price"
            value={formatPrice(
              trackingData.total_amount,
              trackingData.currency,
            )}
          />
          {trackingData.estimated_delivery ? (
            <StatCard
              label="Expected Delivery"
              value={formatDate(trackingData.estimated_delivery)}
            />
          ) : null}
        </div>

        {/* DELIVERY ADDRESS */}
        {trackingData.shipping_address || trackingData.customer_name || trackingData.customer_phone ? (
          <div className="rounded-lg border border-border bg-brand-c100 p-6 mb-8">
            <h3 className="text-sm font-semibold text-brand-ink mb-4 flex items-center gap-2">
              <MapPin className="size-4" />
              Delivery Address
            </h3>
            <div className="space-y-3">
              {trackingData.customer_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer Name</span>
                  <span className="text-brand-ink">{trackingData.customer_name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery Address</span>
                <span className="text-brand-ink break-words">
                  {trackingData.shipping_address}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer Phone</span>
                <span className="text-brand-ink">
                  {trackingData.customer_phone || "—"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* ITEMS ORDERED */}
        <div className="rounded-lg border border-border bg-brand-c100 p-6 mb-8">
          <h3 className="text-sm font-semibold text-brand-ink mb-4 flex items-center gap-2">
            <ShoppingBag className="size-4" />
            Items Ordered
          </h3>
          <div className="grid gap-3">
            {trackingData.items.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-3 border-b border-brand-c200/50 pb-3 last:border-0"
              >
                <div className="relative size-10 shrink-0 rounded-lg bg-brand-white overflow-hidden">
                  {item.product_image ? (
                    <SmartImage
                      src={item.product_image}
                      alt={item.product_name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center bg-brand-c50 text-brand-ink/30">
                      <Package className="size-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-brand-ink truncate">
                      {item.product_name}
                    </span>
                    {item.variant && (
                      <span className="text-xs text-muted-foreground">
                        {item.variant}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Qty {item.quantity}
                  </p>
                  <p className="text-xs font-medium text-brand-ink">
                    {formatPrice(item.line_total, trackingData.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COURIER DETAILS */}
        {trackingData.courier_name || trackingData.tracking_id ? (
          <div className="rounded-lg border border-border bg-brand-c100 p-6 mb-8">
            <h3 className="text-sm font-semibold text-brand-ink mb-4 flex items-center gap-2">
              <Truck className="size-4" />
              Courier Details
            </h3>
            <div className="grid gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Courier Partner</span>
                <span className="text-brand-ink">
                  {trackingData.courier_name || trackingData.courier_partner || "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tracking ID</span>
                <span className="text-brand-ink">
                  {trackingData.tracking_id || trackingData.tracking_number || "—"}
                </span>
              </div>
              {trackingData.courier_tracking_url && (
                <a
                  href={trackingData.courier_tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-c300/70 bg-brand-white px-4 py-2 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-c100"
                >
                  Track on courier website <ArrowRight className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        ) : null}

        {/* TRACKING TIMELINE */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-brand-ink mb-4 flex items-center gap-2">
            <Clock className="size-4" />
            Tracking Timeline
          </h3>
          <div className="relative">
            <div className="absolute left-[14px] top-8 bottom-[20px] w-[2px] bg-border" />

            {TRACKING_TIMELINE.map((status, idx) => {
              const stage = statusToDeliveryStage(status);
              const isCompleted =
                stage !== null && isStageCompleted(stage);
              const isCurrent = stage !== null && isStageCurrent(stage);
              const isLast = idx === TRACKING_TIMELINE.length - 1;
              const event = eventsByStatus.get(status);

              return (
                <div key={status} className="relative pl-14 pb-6 last:pb-0">
                  {!isLast && (
                    <div
                      className="absolute left-[13px] top-[34px] bottom-[2px] w-[2px] bg-border"
                    />
                  )}
                  <div className="absolute left-[10px] top-[28px] z-10">
                    <div
                      className={cn(
                        "size-6 rounded-full border-2 flex items-center justify-center",
                        isCompleted
                          ? "border-brand-ink bg-brand-ink"
                          : "border-border bg-white",
                      )}
                    >
                      {isCompleted && (
                        <CheckCircle2 className="size-2.5 text-white" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isCompleted
                            ? "text-brand-ink"
                            : "text-muted-foreground",
                        )}
                      >
                        {ORDER_STATUS_LABELS[status]}
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 text-[0.65rem] font-medium text-brand-ink">
                          Current
                        </span>
                      ) : null}
                      {event ? (
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.created_at)}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "text-sm",
                        isCompleted ? "text-brand-ink" : "text-muted-foreground",
                      )}
                    >
                      {event?.description ??
                        (isCurrent
                          ? "Current stage"
                          : isCompleted
                            ? DEFAULT_STATUS_MESSAGES[status]
                            : "Pending")}
                    </p>
                    {event?.courier_name || event?.tracking_number ? (
                      <p className="text-xs text-muted-foreground">
                        {event.courier_name ? `Courier: ${event.courier_name}` : ""}
                        {event.courier_name && event.tracking_number ? " · " : ""}
                        {event.tracking_number ? `Tracking: ${event.tracking_number}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {trackingData.tracking_events.length > 0 ? (
          <div className="mb-8 rounded-lg border border-border bg-brand-c100 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-ink">
              <Clock className="size-4" />
              Status Updates
            </h3>
            <ol className="space-y-3">
              {trackingData.tracking_events
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id} className="border-l-2 border-brand-c300 pl-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-brand-ink">
                        {orderStatusLabel(event.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </span>
                    </div>
                    {event.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                    ) : null}
                    {event.courier_name || event.tracking_number ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.courier_name ?? ""}
                        {event.courier_name && event.tracking_number ? " · " : ""}
                        {event.tracking_number ?? ""}
                      </p>
                    ) : null}
                  </li>
                ))}
            </ol>
          </div>
        ) : null}

        {/* NEED HELP */}
        <div className="mt-8 rounded-lg border border-border bg-brand-c100 p-6">
          <h3 className="text-sm font-semibold text-brand-ink mb-4">
            Need Help?
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Contact our support team for assistance with your order.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/contact"
              className="w-full inline-flex items-center justify-center rounded-lg border border-brand-c300/70 bg-brand-white px-4 py-3 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-c100"
            >
              Contact Support
            </a>
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""}`}
              className="w-full inline-flex items-center justify-center rounded-lg border border-brand-c300/70 bg-brand-white px-4 py-3 text-base font-semibold text-brand-ink transition-colors hover:bg-brand-c100"
            >
              <Mail className="size-4 mr-2" /> Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-brand-white p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-brand-ink">{value}</p>
    </div>
  );
}