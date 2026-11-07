-- 0025_order_pincode_and_email.sql
-- Ensure the dedicated `shipping_pincode` (text, preserves leading zeroes) and
-- `customer_email` columns exist on the orders table. Additive and idempotent:
-- never deletes or rewrites an existing order row.

alter table public.orders
  add column if not exists shipping_pincode text;

alter table public.orders
  add column if not exists customer_email text;

create index if not exists orders_shipping_pincode_idx
  on public.orders (shipping_pincode);

comment on column public.orders.shipping_pincode is
  'Delivery PIN code stored as text so leading zeroes are preserved.';

comment on column public.orders.customer_email is
  'Customer email address captured at checkout.';

comment on column public.orders.status is
  'Fulfilment status: pending, confirmed, processing (Packing), shipped, out_for_delivery, delivered, plus exception states.';

comment on column public.orders.payment_status is
  'Payment status: pending, authorized, paid, failed, refund_initiated, refunded, partially_refunded. Separate from fulfilment status.';
