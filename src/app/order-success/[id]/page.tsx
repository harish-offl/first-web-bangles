import { notFound } from "next/navigation";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { getCatalog } from "@/lib/data";
import { formatPrice } from "@/lib/site";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/orders/lifecycle";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Order Confirmation - ${id}`,
  };
}

export default async function OrderSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getCatalog().getOrderById(id);
  if (!order) notFound();

  return (
    <main className="container-page py-16">
      <section className="max-w-lg space-y-6 rounded-2xl border border-border bg-card p-8 sm:text-left">
        <div className="mx-auto sm:mx-0 flex size-16 items-center justify-center rounded-full bg-success/10 text-success mb-4">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl sm:text-center">Thank you for your order</h1>
        <p className="text-muted-foreground sm:text-center">
          Your order has been confirmed.
        </p>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Order number</dt>
            <dd className="font-medium">{order.order_number}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Order status</dt>
            <dd className="font-medium">{orderStatusLabel(order.status)}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Payment status</dt>
            <dd className="font-medium">{paymentStatusLabel(order.payment_status)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium">
              {formatPrice(order.total_amount, order.currency)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-muted-foreground sm:text-center">
          We&apos;ll start processing your bangles and share delivery details shortly.
        </p>
        <Link href="/shop" className="underline-offset-4 hover:underline">
          Browse more
        </Link>
      </section>
    </main>
  );
}
