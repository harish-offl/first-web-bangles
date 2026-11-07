import type { OrderStatus, PaymentStatus } from "@/types";

/**
 * Allowed status transitions for the Bangles by Beauty order lifecycle.
 *
 * The graph is intentionally narrow: an order cannot jump randomly between
 * statuses. Each arrow represents a permitted `previous -> next` move. The
 * empty set for a status means no further transition is permitted from there
 * (terminal states such as `delivered` or `cancelled`).
 *
 * Exceptional statuses (`payment_pending`, `payment_failed`, `stock_unavailable`,
 * `return_requested`, etc.) are reachable from their parent states and can
 * return to the main flow where business rules allow.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "processing", "payment_failed", "stock_unavailable", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled", "payment_failed", "stock_unavailable"],
  processing: ["shipped", "cancelled", "stock_unavailable"],
  shipped: ["out_for_delivery", "delivered", "delivery_failed", "cancelled"],
  out_for_delivery: ["delivered", "delivery_failed", "cancelled"],
  delivered: ["return_requested"],
  cancelled: ["refund_initiated"],
  delivery_failed: ["return_requested", "shipped", "cancelled"],
  return_requested: ["return_approved", "return_rejected", "cancelled"],
  return_approved: ["refund_initiated"],
  return_rejected: ["delivered", "cancelled"],
  refund_initiated: ["refunded"],
  refunded: [],
  payment_pending: ["pending", "payment_failed", "cancelled"],
  payment_failed: ["pending", "cancelled"],
  stock_unavailable: ["pending", "cancelled"],
  returned: ["refund_initiated"],
};

export { type OrderStatus };

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Order Placed",
  confirmed: "Order Confirmed",
  processing: "Packing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  delivery_failed: "Delivery Failed",
  return_requested: "Return Requested",
  return_approved: "Return Approved",
  return_rejected: "Return Rejected",
  refund_initiated: "Refund Initiated",
  refunded: "Refunded",
  payment_pending: "Payment Pending",
  payment_failed: "Payment Failed",
  stock_unavailable: "Stock Unavailable",
  returned: "Returned",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  failed: "Failed",
  refund_initiated: "Refund Initiated",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
};

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

export const DELIVERY_STAGE_LABELS: Record<string, string> = {
  order_placed: "Order Placed",
  order_confirmed: "Order Confirmed",
  packing: "Packing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

/** Canonical timeline order for the customer-facing progress display. */
export const TRACKING_TIMELINE: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

/** Fulfilment statuses shown in the admin status dropdown.
 * Return/refund exception statuses are handled through separate actions. */
export const FULFILMENT_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "stock_unavailable",
];

const STATUS_TO_DELIVERY_STAGE: Partial<Record<OrderStatus, string>> = {
  pending: "order_placed",
  confirmed: "order_confirmed",
  processing: "packing",
  shipped: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
};

export function statusToDeliveryStage(status: OrderStatus): string | null {
  return STATUS_TO_DELIVERY_STAGE[status] ?? null;
}

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pending";
  return PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
}

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return ORDER_STATUS_LABELS[status] ?? status;
}

export const DEFAULT_STATUS_MESSAGES: Record<OrderStatus, string> = {
  pending: "We have received your order successfully.",
  confirmed: "Your order has been confirmed and the product availability is verified.",
  processing: "We are carefully packing your order.",
  shipped: "Your order has been dispatched and is on its way.",
  out_for_delivery: "Your order is out for delivery. Please keep your phone available.",
  delivered: "Your order has been successfully delivered. Thank you for shopping with Bangles by Beauty.",
  cancelled: "Your order has been cancelled. You will hear from us if any payment needs attention.",
  delivery_failed: "Delivery could not be completed. Our team is working with the courier to resolve this.",
  return_requested: "We have received your return request and are reviewing it.",
  return_approved: "Your return has been approved. Please ship the item back to us.",
  return_rejected: "Your return request could not be approved. Please contact support for more information.",
  refund_initiated: "Your refund has been initiated and should reflect in your account shortly.",
  refunded: "Your refund has been completed.",
  payment_pending: "Your payment is still pending. Please complete it to keep your order moving.",
  payment_failed: "Your payment could not be processed. Please try again.",
  stock_unavailable: "Some items in your order are currently unavailable. Our team will reach out.",
  returned: "We have received your returned item. Refund is being processed.",
};

/**
 * Returns the set of statuses that may follow `status`, or an empty set for
 * terminal states.
 */
export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[status] ?? [];
}

/**
 * Throws if `next` is not reachable from `previous`.
 */
export function assertValidTransition(previous: OrderStatus, next: OrderStatus): void {
  const allowed = allowedTransitions(previous);
  if (!allowed.includes(next)) {
    throw new Error(
      `Invalid order status transition: ${previous} -> ${next}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
    );
  }
}

/**
 * Returns the timeline index of `status`, or -1 when it is not part of the
 * canonical delivery timeline (e.g. exceptional statuses).
 */
export function timelineIndex(status: OrderStatus): number {
  return TRACKING_TIMELINE.indexOf(status);
}

export function isTimelineStatus(status: string): status is OrderStatus {
  return TRACKING_TIMELINE.includes(status as OrderStatus);
}

export function isExceptionalStatus(status: string): boolean {
  return !isTimelineStatus(status);
}