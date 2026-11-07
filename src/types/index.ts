/**
 * Shared domain types for the Bangles by Beauty storefront and admin.
 *
 * Shapes mirror the Supabase schema in `supabase/migrations` so the same
 * types work for the hosted database and the local development driver.
 */

export type ProfileRole = "customer" | "admin";

export interface Profile {
  id: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  /** Present when the driver aggregates a count (catalogue listing). */
  product_count?: number;
}

export interface CategoryProduct {
  id: string;
  category_id: string;
  product_id: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  storage_path: string | null;
  alt_text: string;
  sort_order: number;
  created_at?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  /** Colourway name for products with a colour palette (glass bangles). */
  colour?: string | null;
  /** Swatch colour used by the storefront. */
  colour_hex?: string | null;
  /** Display size, e.g. "2.10". */
  size?: string | null;
  /** Optional photograph of this exact colourway. */
  image_url?: string | null;
  sku: string | null;
  price_override: number | null;
  stock_quantity: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * A category-level colour palette. Glass bangles share one palette so new
 * colourways do not require duplicating the product.
 */
export interface ProductColour {
  id: string;
  category_id: string;
  name: string;
  hex_code: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Photography that is specific to one colour option (used by glass bangles,
 * where every colour has its own image). Colour names match the entries in
 * `Product.colours` so the product page can swap the gallery image when a
 * shopper picks a colour.
 */
export interface ColourImage {
  colour: string;
  image_url: string;
}

/**
 * `stock_quantity === null` means inventory is not tracked for this product.
 * Most legacy catalogue items are made to order, so the original site never
 * published stock numbers and none are invented here. A non-null value is an
 * explicit count set by an administrator.
 */
export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number | null;
  primary_image_url: string | null;
  colours: string[];
  /**
   * Optional per-colour photography. When present, the product page shows the
   * matching image as the shopper switches colour. Absent for most products.
   */
  colour_images?: ColourImage[];
  /** Category palette, populated with the product detail query. */
  colour_palette?: ProductColour[];
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at?: string;
  updated_at?: string;
  /** Aggregates populated by the data driver. */
  category?: Category | null;
  category_name?: string | null;
  images?: ProductImage[];
  variants?: ProductVariant[];
  /** Populated on catalogue queries; used for pagination metadata. */
  total?: number;
  /** Legacy identifier from the migrated catalogue, retained for traceability. */
  legacy_id?: string | null;
  legacy_image_source?: string | null;
  sort_index?: number;
}

export interface ProductFilters {
  q?: string;
  category?: string;
  colour?: string[];
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";
  page?: number;
  pageSize?: number;
  featured?: boolean;
  new_arrivals?: boolean;
  ids?: string[];
  include_inactive?: boolean;
  /** Include per-size variant stock (used by the admin inventory screen). */
  include_variants?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "delivery_failed"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_initiated"
  | "refunded"
  | "payment_pending"
  | "payment_failed"
  | "stock_unavailable"
  | "returned";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refund_initiated"
  | "refunded"
  | "partially_refunded";

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email?: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  shipping_pincode?: string | null;
  customer_state: string | null;
  status: OrderStatus;
  payment_status?: PaymentStatus | null;
  currency: string;
  subtotal: number;
  shipping_fee?: number;
  shipping_fee_paise?: number;
  discount?: number;
  discount_paise?: number;
  total_amount: number;
  total_amount_paise?: number;
  notes: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  courier_tracking_url?: string | null;
  estimated_delivery?: string | null;
  delivery_stage?: string | null;
  courier_partner?: string | null;
  tracking_id?: string | null;
  tracking_updated_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  confirmed_at?: string | null;
  processing_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  customer_message: string | null;
  internal_note: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_delivery: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface CustomerNotification {
  id: string;
  customer_id: string;
  order_id: string | null;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface UpdateOrderLifecycleInput {
  orderId: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  deliveryStage?: string | null;
  courierName?: string | null;
  courierPartner?: string | null;
  trackingId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: string | null;
  customerMessage?: string | null;
  internalNote?: string | null;
  updatedBy: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  /** Variant purchased, when the product uses colour/size inventory. */
  variant_id?: string | null;
  colour?: string | null;
  size?: string | null;
  product_name_snapshot: string;
  selected_variant_snapshot: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export type StoreSettings = {
  store_name: string;
  whatsapp_number: string | null;
  contact_email: string | null;
  currency: string;
  announcement: string | null;
  shipping_info: string | null;
  footer_note: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  pinterest_url: string | null;
  location: string | null;
  seo_title_template: string | null;
  seo_default_description: string | null;
  free_shipping_threshold: number | null;
  /** Delivery fee (in rupees) for addresses inside Tamil Nadu. */
  delivery_fee_tn: number | null;
  /** Delivery fee (in rupees) for addresses outside Tamil Nadu. */
  delivery_fee_outside_tn: number | null;
};

export interface AdminUser {
  id: string;
  email: string;
  role: ProfileRole;
  display_name: string | null;
}

export type DataMode = "supabase" | "local";

export interface DataModeInfo {
  mode: DataMode;
  /** Human-readable reason shown in admin when running without Supabase. */
  reason: string;
}
