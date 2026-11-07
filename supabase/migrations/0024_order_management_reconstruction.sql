-- 0024_order_management_reconstruction.sql
-- Order management hardening: keep delivery PIN codes as text so values with
-- leading zeroes survive, and document the lifecycle fields already in use.
--
-- This migration is additive and idempotent. It never deletes or rewrites an
-- existing order, payment or address row.

alter table public.orders
  add column if not exists shipping_pincode text;

create index if not exists orders_shipping_pincode_idx
  on public.orders (shipping_pincode);

-- Refresh the payment-status check so the separate payment lifecycle supports
-- the refund-initiated stage as well as the original Razorpay states.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_payment_status_check
  check (
    payment_status in (
      'pending',
      'authorized',
      'paid',
      'failed',
      'refund_initiated',
      'refunded',
      'partially_refunded'
    )
  ) not valid;

comment on column public.orders.shipping_pincode is
  'Delivery PIN code stored as text so leading zeroes are preserved.';

comment on column public.orders.status is
  'Fulfilment status: pending, confirmed, processing (Packing), shipped, out_for_delivery, delivered, plus exception states.';

comment on column public.orders.payment_status is
  'Payment status: pending, authorized, paid, failed, refund_initiated, refunded, partially_refunded.';

comment on table public.order_status_history is
  'Append-only order lifecycle audit trail. Every admin status change records the previous and new status, courier metadata, customer message and internal note.';
