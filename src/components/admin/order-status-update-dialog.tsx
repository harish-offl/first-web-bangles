"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PencilLine } from "lucide-react";

import { updateOrderLifecycleAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ActionState } from "@/lib/admin/action-state";
import type { Order } from "@/types";
import {
  DEFAULT_STATUS_MESSAGES,
  FULFILMENT_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  allowedTransitions,
} from "@/lib/orders/lifecycle";

interface OrderStatusUpdateDialogProps {
  order: Order;
  trigger?: React.ReactElement;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function OrderStatusUpdateDialog({ order, trigger }: OrderStatusUpdateDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const fulfilmentSet = new Set(FULFILMENT_STATUSES);
  const statusOptions = [order.status, ...allowedTransitions(order.status)]
    .filter((status) => fulfilmentSet.has(status))
    .filter((status, index, list) => list.indexOf(status) === index);

  const [, formAction, isPending] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await updateOrderLifecycleAction(previous, formData);
      if (result.status === "success") {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else if (result.status === "error") {
        toast.error(result.message);
      }
      return result;
    },
    { status: "idle" },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <PencilLine className="size-3.5" />
              Update
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update order</DialogTitle>
          <DialogDescription>
            #{order.order_number} · currently {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="orderId" value={order.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="status">Order status</Label>
              <select
                id="status"
                name="status"
                defaultValue={order.status}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status] ?? status}
                    {status === order.status ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paymentStatus">Payment status</Label>
              <select
                id="paymentStatus"
                name="paymentStatus"
                defaultValue={order.payment_status ?? "pending"}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Shipping details</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="courierName">Courier name</Label>
                <Input
                  id="courierName"
                  name="courierName"
                  defaultValue={order.courier_name ?? order.courier_partner ?? ""}
                  placeholder="India Post, Delhivery, Blue Dart…"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trackingNumber">Tracking / AWB number</Label>
                <Input
                  id="trackingNumber"
                  name="trackingNumber"
                  defaultValue={order.tracking_number ?? order.tracking_id ?? ""}
                  placeholder="IN123456789"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="trackingUrl">Courier tracking URL</Label>
                <Input
                  id="trackingUrl"
                  name="trackingUrl"
                  type="url"
                  defaultValue={order.courier_tracking_url ?? ""}
                  placeholder="https://courier.example/track/…"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="estimatedDelivery">Estimated delivery</Label>
                <Input
                  id="estimatedDelivery"
                  name="estimatedDelivery"
                  type="date"
                  defaultValue={toDateInput(order.estimated_delivery)}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Customer communication</h3>
            <div className="mt-3 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customerMessage">Message sent to customer</Label>
                <Textarea
                  id="customerMessage"
                  name="customerMessage"
                  rows={3}
                  placeholder={
                    DEFAULT_STATUS_MESSAGES[order.status] ?? "Describe this status update…"
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="internalNote">Internal note (admin only)</Label>
                <Textarea
                  id="internalNote"
                  name="internalNote"
                  rows={2}
                  placeholder="Optional note for the team"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
