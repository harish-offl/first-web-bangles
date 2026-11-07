import type {
  Category,
  ColourImage,
  CustomerNotification,
  DataMode,
  DataModeInfo,
  Order,
  OrderStatus,
  OrderStatusHistory,
  Paginated,
  PaymentStatus,
  Product,
  ProductColour,
  ProductVariant,
  ProductFilters,
  StoreSettings,
  UpdateOrderLifecycleInput,
} from "@/types";

export interface ProductInput {
  name: string;
  slug: string;
  description: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number | null;
  category_id: string | null;
  primary_image_url: string | null;
  colours: string[];
  colour_images: ColourImage[];
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  seo_title: string | null;
  seo_description: string | null;
}

export interface CategoryInput {
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductVariantInput {
  variant_name: string;
  variant_value: string;
  colour?: string | null;
  colour_hex?: string | null;
  size?: string | null;
  image_url?: string | null;
  sku?: string | null;
  price_override?: number | null;
  stock_quantity?: number | null;
  is_active?: boolean;
}

export interface ProductColourInput {
  id?: string;
  name: string;
  hex_code: string;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface OrderItemInput {
  productId: string | null;
  productName: string;
  variant: string | null;
  variantId?: string | null;
  colour?: string | null;
  size?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface OrderInput {
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerPincode: string | null;
  customerState: string | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  items: OrderItemInput[];
}

export interface CatalogDriver {
  readonly mode: DataMode;

  listProducts(filters?: ProductFilters): Promise<Paginated<Product>>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getProductById(id: string): Promise<Product | null>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  listCategories(options?: { activeOnly?: boolean }): Promise<Category[]>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  getColours(): Promise<string[]>;
  getSettings(): Promise<StoreSettings>;
  /** Returns product ids ranked by recorded order quantity; empty without sales data. */
  getBestsellerIds(limit?: number): Promise<string[]>;

  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: Partial<ProductInput>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  createCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  /** Returns product ids assigned to a category (junction table source of truth). */
  getCategoryProductIds(categoryId: string): Promise<string[]>;

  /** Replaces all product assignments for a category in one operation. */
  replaceCategoryProducts(categoryId: string, productIds: string[]): Promise<void>;

  /** Lists products assigned to a category with filtering/pagination (storefront). */
  listProductsByCategory(
    categoryId: string,
    filters?: ProductFilters,
  ): Promise<Paginated<Product>>;

  /** Variant stock management */
  updateVariantStock(variantId: string, stockQuantity: number | null): Promise<void>;
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  createVariant(productId: string, variant: ProductVariantInput): Promise<ProductVariant>;
  updateVariant(variantId: string, variant: Partial<ProductVariantInput>): Promise<ProductVariant>;
  deleteVariant(variantId: string): Promise<void>;
  deleteProductVariants(productId: string): Promise<void>;

  /** Category-level colour palettes (glass bangles). */
  listProductColours(categoryId: string): Promise<ProductColour[]>;
  syncProductColours(
    categoryId: string,
    colours: ProductColourInput[],
  ): Promise<ProductColour[]>;

  listOrders(options?: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    q?: string;
  }): Promise<Order[]>;
  listOrdersPage(options?: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<Order>>;
  /** Count of orders grouped by status, used by the admin dashboard header. */
  getOrderStatusCounts(): Promise<Partial<Record<OrderStatus, number>>>;
  getOrderById(id: string): Promise<Order | null>;
  createOrder(input: OrderInput): Promise<Order>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;

  /**
   * Admin-driven order lifecycle update. Validates the transition, persists
   * tracking/courier metadata, writes an audit record and creates a customer
   * notification. Returns the updated order. Throws on an invalid transition.
   */
  updateOrderLifecycle(input: UpdateOrderLifecycleInput): Promise<Order>;

  /** Append-only audit trail for a single order, oldest first. */
  listOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]>;

  /** Append-only audit trail for multiple orders, oldest first. */
  listOrderStatusHistoryForOrders(orderIds: string[]): Promise<OrderStatusHistory[]>;

  /** Orders belonging to a customer, newest first. */
  listCustomerOrders(customerId: string): Promise<Order[]>;

  /** Single order owned by a customer, or null when absent/forbidden. */
  getCustomerOrderById(customerId: string, id: string): Promise<Order | null>;

  listCustomerNotifications(customerId: string): Promise<CustomerNotification[]>;

  markCustomerNotificationRead(id: string, customerId: string): Promise<boolean>;

  updateSettings(input: Partial<StoreSettings>): Promise<StoreSettings>;
}

export function getDataModeInfo(): DataModeInfo {
  if (isLocalCatalogMode()) {
    return { mode: "local", reason: "CATALOG_MODE=local is set for local development." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    return { mode: "supabase", reason: "beautybybangles database configured via environment." };
  }
  return {
    mode: "local",
    reason:
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set, so the read-only local catalogue copy is being served. Configure Supabase before going live.",
  };
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isLocalCatalogMode = (): boolean =>
  process.env.NODE_ENV === "development" && process.env.CATALOG_MODE === "local";
