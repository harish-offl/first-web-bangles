"use client";

import { Eye, MapPin, Package, Phone, Mail, Truck, CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TrackingTimeline } from "@/components/account/tracking-timeline";
import { formatPrice } from "@/lib/site";
import { orderStatusLabel } from "@/lib/orders/lifecycle";
import type { Order, OrderStatusHistory } from "@/types";
import { PaymentStatusBadge, OrderStatusBadge } from "./order-status-badge";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractPincode(address: string | null | undefined): string | null {
  if (!address) return null;
  return address.match(/\b\d{6}\b/)?.[0] ?? null;
}

export function OrderDetailDialog({
  order,
  history,
}: {
  order: Order;
  history: OrderStatusHistory[];
}) {
  const items = order.items ?? [];
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const pincode = order.shipping_pincode ?? extractPincode(order.shipping_address);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Eye className="size-3.5" />
            View
          </Button>
        }
      />
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Package className="size-5" />
            {order.order_number}
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </DialogTitle>
          <DialogDescription>
            Placed {formatDateTime(order.created_at)} · {itemCount} item
            {itemCount === 1 ? "" : "s"} · {formatPrice(order.total_amount, order.currency)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <section className="rounded-lg border border-border p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-gold-strong" />
              Customer & delivery
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="text-right font-medium">{order.customer_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="size-3.5" /> Phone
                </dt>
                <dd className="text-right">{order.customer_phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Mail className="size-3.5" /> Email
                </dt>
                <dd className="max-w-[16rem] truncate text-right">
                  {order.customer_email ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">State</dt>
                <dd className="text-right">{order.customer_state ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">PIN code</dt>
                <dd className="text-right tabular-nums">{pincode ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd className="mt-1 whitespace-pre-line rounded-md bg-muted/50 p-2 text-sm">
                  {order.shipping_address ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="size-4 text-gold-strong" />
              Shipping & payment
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Courier</dt>
                <dd className="text-right">
                  {order.courier_name ?? order.courier_partner ?? "Not assigned"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tracking</dt>
                <dd className="text-right tabular-nums">
                  {order.tracking_number ?? order.tracking_id ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Expected</dt>
                <dd className="text-right">{formatDateTime(order.estimated_delivery)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Shipped</dt>
                <dd className="text-right">{formatDateTime(order.shipped_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Delivered</dt>
                <dd className="text-right">{formatDateTime(order.delivered_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <CreditCard className="size-3.5" /> Payment
                </dt>
                <dd className="text-right">
                  <PaymentStatusBadge status={order.payment_status} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Razorpay order</dt>
                <dd className="max-w-[10rem] truncate text-right text-xs">
                  {order.razorpay_order_id ?? "—"}
                </dd>
              </div>
            </dl>
            {order.courier_tracking_url ? (
              <a
                href={order.courier_tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex text-sm font-medium text-gold-strong underline-offset-4 hover:underline"
              >
                Open courier tracking
              </a>
            ) : null}
          </section>
        </div>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Items</h3>
          <div className="mt-3 divide-y divide-border">
            {items.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No item snapshots.</p>
            ) : null}
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.product_name_snapshot}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.selected_variant_snapshot ?? "Standard"}
                    {item.colour ? ` · ${item.colour}` : ""}
                    {item.size ? ` · Size ${item.size}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums">{formatPrice(item.line_total, order.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatPrice(item.unit_price, order.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">
                {formatPrice(
                  order.shipping_fee ?? (order.shipping_fee_paise ?? 0) / 100,
                  order.currency,
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">
                −{formatPrice(order.discount ?? (order.discount_paise ?? 0) / 100, order.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(order.total_amount, order.currency)}</dd>
            </div>
          </dl>
        </section>

        {order.notes ? (
          <section className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">Customer note</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{order.notes}</p>
          </section>
        ) : null}

        <TrackingTimeline order={order} history={history} />

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Status history</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No status changes recorded yet.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {history
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium">
                        {orderStatusLabel(event.previous_status)} →{" "}
                        {orderStatusLabel(event.new_status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </span>
                    </div>
                    {event.customer_message ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {event.customer_message}
                      </p>
                    ) : null}
                    {event.internal_note ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        Internal: {event.internal_note}
                      </p>
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
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
