import type { Metadata } from "next";
import Link from "next/link";

import { AdminPageHeader, StatCard } from "@/components/admin/ui";
import { OrderDetailDialog } from "@/components/admin/order-detail-dialog";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-status-badge";
import { OrderStatusUpdateDialog } from "@/components/admin/order-status-update-dialog";
import { WhatsAppOrderButton } from "@/components/admin/whatsapp-order-button";
import { ListingPagination } from "@/components/shop/listing-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCatalog } from "@/lib/data";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
} from "@/lib/orders/lifecycle";
import { formatPrice } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { OrderStatus, PaymentStatus } from "@/types";

export const metadata: Metadata = { title: "Order Management" };

const PAGE_SIZE = 25;
const STATUS_VALUES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(first(searchParams.page)) || 1);
  const statusValue = first(searchParams.status);
  const status = STATUS_VALUES.includes(statusValue as OrderStatus)
    ? (statusValue as OrderStatus)
    : undefined;
  const paymentValue = first(searchParams.paymentStatus);
  const paymentStatus = PAYMENT_STATUSES.includes(paymentValue as PaymentStatus)
    ? (paymentValue as PaymentStatus)
    : undefined;
  const q = first(searchParams.q).trim();

  const catalog = getCatalog();
  const [result, counts] = await Promise.all([
    catalog.listOrdersPage({
      page,
      pageSize: PAGE_SIZE,
      status,
      paymentStatus,
      q: q || undefined,
    }),
    catalog.getOrderStatusCounts(),
  ]);
  const orders = result.items;
  const histories = await catalog.listOrderStatusHistoryForOrders(orders.map((order) => order.id));
  const historyByOrder = new Map<string, typeof histories>();
  for (const event of histories) {
    const list = historyByOrder.get(event.order_id) ?? [];
    list.push(event);
    historyByOrder.set(event.order_id, list);
  }

  const totalOrders = (Object.values(counts) as number[]).reduce((sum, value) => sum + value, 0);
  const newOrders = (counts.pending ?? 0) + (counts.confirmed ?? 0);
  const packingOrders = counts.processing ?? 0;
  const shippedOrders = counts.shipped ?? 0;
  const outForDelivery = counts.out_for_delivery ?? 0;
  const deliveredOrders = counts.delivered ?? 0;
  const cancelledOrders = counts.cancelled ?? 0;

  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (paymentStatus) baseParams.set("paymentStatus", paymentStatus);
  if (q) baseParams.set("q", q);
  const hasFilters = Boolean(status || paymentStatus || q || page > 1);

  return (
    <div>
      <AdminPageHeader
        title="Order Management"
        description={`Track payments, packing, courier details and delivery. ${totalOrders} order${totalOrders === 1 ? "" : "s"} on record.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Orders" value={totalOrders} />
        <StatCard label="New / Confirmed" value={newOrders} />
        <StatCard label="Packing" value={packingOrders} />
        <StatCard label="Shipped" value={shippedOrders} />
        <StatCard label="Out for Delivery" value={outForDelivery} />
        <StatCard label="Delivered" value={deliveredOrders} />
        <StatCard label="Cancelled" value={cancelledOrders} />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Orders</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.total} order{result.total === 1 ? "" : "s"} match the current filters.
            </p>
          </div>
          {hasFilters ? (
            <Link href="/admin/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Clear filters
            </Link>
          ) : null}
        </div>

        <form method="get" className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_200px_200px_auto]">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search order ID, customer name or phone"
            aria-label="Search orders"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            aria-label="Filter by order status"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">All order statuses</option>
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            name="paymentStatus"
            defaultValue={paymentStatus ?? ""}
            aria-label="Filter by payment status"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">All payment statuses</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-9">
            Filter
          </Button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No orders match these filters.
                  </td>
                </tr>
              ) : null}
              {orders.map((order) => {
                const itemCount = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
                return (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium tabular-nums">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[12rem] truncate">{order.customer_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_phone ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatPrice(order.total_amount, order.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={order.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(order.updated_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <OrderDetailDialog
                          order={order}
                          history={historyByOrder.get(order.id) ?? []}
                        />
                        <OrderStatusUpdateDialog order={order} />
                        <WhatsAppOrderButton order={order} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListingPagination
          page={result.page}
          pageCount={result.pageCount}
          basePath="/admin/orders"
          baseParams={baseParams.toString()}
        />
      </div>
    </div>
  );
}
