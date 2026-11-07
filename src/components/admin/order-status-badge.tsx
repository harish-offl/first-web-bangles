import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS, paymentStatusLabel } from "@/lib/orders/lifecycle";

const SUCCESS_STATUSES = new Set(["delivered", "refunded"]);
const WARNING_STATUSES = new Set(["out_for_delivery", "return_requested", "refund_initiated"]);
const DANGER_STATUSES = new Set([
  "cancelled",
  "delivery_failed",
  "payment_failed",
  "stock_unavailable",
  "return_rejected",
]);

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        SUCCESS_STATUSES.has(status)
          ? "border-success/30 bg-success/10 text-success"
          : DANGER_STATUSES.has(status)
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : WARNING_STATUSES.has(status)
              ? "border-gold-strong/40 bg-brand-c100 text-foreground"
              : "border-border bg-muted text-muted-foreground",
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "paid"
          ? "border-success/30 bg-success/10 text-success"
          : status === "failed" || status === "refund_initiated"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : status === "refunded" || status === "partially_refunded"
              ? "border-border bg-muted text-foreground"
              : "border-gold-strong/40 bg-brand-c100 text-foreground",
      )}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}
