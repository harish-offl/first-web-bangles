import "server-only";

import fs from "node:fs";
import path from "node:path";

import { DEFAULT_SETTINGS } from "@/lib/site";
import {
  DEFAULT_STATUS_MESSAGES,
  ORDER_STATUS_LABELS,
  assertValidTransition,
  statusToDeliveryStage,
  type OrderStatus,
} from "@/lib/orders/lifecycle";
import { GLASS_COLOUR_PALETTE } from "@/lib/glass-colours";
import type {
  Category,
  CustomerNotification,
  Order,
  OrderStatusHistory,
  Paginated,
  Product,
  ProductColour,
  ProductVariant,
  ProductFilters,
  StoreSettings,
  UpdateOrderLifecycleInput,
} from "@/types";

import type {
  CatalogDriver,
  OrderInput,
  ProductColourInput,
  ProductVariantInput,
} from "./driver";
import { decodeHtmlEntities, normalizeDescription } from "./text";

interface CatalogFile {
  categories: Category[];
  products: Product[];
  product_colours?: ProductColour[];
}

const SEED_PATH = path.join(process.cwd(), "src", "lib", "data", "catalog.json");
const RUNTIME_DIR = path.join(process.cwd(), ".data");
const RUNTIME_PATH = path.join(RUNTIME_DIR, "catalog.json");
const SETTINGS_PATH = path.join(RUNTIME_DIR, "settings.json");
const ORDERS_PATH = path.join(RUNTIME_DIR, "orders.json");
const ORDER_HISTORY_PATH = path.join(RUNTIME_DIR, "order_history.json");
const NOTIFICATIONS_PATH = path.join(RUNTIME_DIR, "notifications.json");

let cache: { mtimeMs: number; data: CatalogFile } | null = null;

/** Decodes migrated HTML entities in the free-text fields we display. */
function decodeProductText(product: Product): Product {
  return {
    ...product,
    name: decodeHtmlEntities(product.name),
    description: normalizeDescription(product.description),
    seo_title: product.seo_title ? decodeHtmlEntities(product.seo_title) : product.seo_title,
    seo_description: product.seo_description
      ? decodeHtmlEntities(product.seo_description)
      : product.seo_description,
  };
}

function decodeCategoryText(category: Category): Category {
  return {
    ...category,
    name: decodeHtmlEntities(category.name),
    description: category.description ? decodeHtmlEntities(category.description) : category.description,
  };
}

function decodeCatalog(data: CatalogFile): CatalogFile {
  return {
    categories: data.categories.map(decodeCategoryText),
    products: data.products.map(decodeProductText),
    product_colours: data.product_colours ?? [],
  };
}

function withPalette(
  product: Product,
  categories: Category[],
  colours: ProductColour[],
): Product {
  const category = product.category_id
    ? categories.find((c) => c.id === product.category_id)
    : undefined;
  let palette = colours.filter((colour) => colour.category_id === product.category_id);

  if (palette.length === 0 && category && /glass/i.test(category.name)) {
    palette = GLASS_COLOUR_PALETTE.map((colour, index) => ({
      id: `local-glass-${index}`,
      category_id: product.category_id ?? "",
      name: colour.name,
      hex_code: colour.hex,
      image_url: null,
      is_active: true,
      sort_order: index,
    }));
  }

  return {
    ...withCategory(product, categories),
    colour_palette: palette,
  };
}

function readCatalog(): CatalogFile {
  try {
    const stat = fs.statSync(RUNTIME_PATH);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8")) as CatalogFile;
    const data = decodeCatalog(parsed);
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch {
    const parsed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as CatalogFile;
    const data = decodeCatalog(parsed);
    cache = { mtimeMs: -1, data };
    return data;
  }
}

function writeCatalog(data: CatalogFile): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(RUNTIME_PATH, JSON.stringify(data, null, 2));
  cache = { mtimeMs: fs.statSync(RUNTIME_PATH).mtimeMs, data };
}

/** Enquiry records recorded while Supabase is not configured. */
function readOrders(): Order[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(ORDERS_PATH, "utf8")) as Order[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOrders(orders: Order[]): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
}

function readOrderHistory(): OrderStatusHistory[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(ORDER_HISTORY_PATH, "utf8")) as OrderStatusHistory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOrderHistory(history: OrderStatusHistory[]): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(ORDER_HISTORY_PATH, JSON.stringify(history, null, 2));
}

function readNotifications(): CustomerNotification[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(NOTIFICATIONS_PATH, "utf8")) as CustomerNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotifications(notifications: CustomerNotification[]): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(NOTIFICATIONS_PATH, JSON.stringify(notifications, null, 2));
}

/** Mirrors the Supabase sequence: BB-YYMM-##### starting at 1001. */
function nextOrderNumber(orders: Order[]): string {
  const now = new Date();
  const yymm = `${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const highest = orders.reduce((max, order) => {
    const match = /-(\d+)$/.exec(order.order_number);
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > max ? value : max;
  }, 1000);
  return `BB-${yymm}-${String(highest + 1).padStart(5, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

function matches(p: Product, f: ProductFilters, categorySlugById: Map<string, string>): boolean {
  if (!f.include_inactive && p.is_active === false) return false;
  if (f.featured && !p.is_featured) return false;
  if (f.new_arrivals && !p.is_new_arrival) return false;
  if (f.ids && !f.ids.includes(p.id)) return false;

  if (f.category) {
    const slug = p.category_id ? categorySlugById.get(p.category_id) : undefined;
    if (slug !== f.category) return false;
  }

  if (f.q) {
    const needle = f.q.trim().toLowerCase();
    if (needle) {
      const haystack = `${p.name} ${p.description} ${p.sku ?? ""} ${p.colours.join(" ")}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
  }

  if (typeof f.minPrice === "number" && p.price < f.minPrice) return false;
  if (typeof f.maxPrice === "number" && p.price > f.maxPrice) return false;

  if (f.colour && f.colour.length) {
    const have = p.colours.map((c) => c.toLowerCase());
    const wanted = f.colour.map((c) => c.toLowerCase());
    if (!wanted.some((w) => have.includes(w))) return false;
  }

  if (f.size) {
    const size = f.size.trim().toLowerCase();
    const hasSize = (p.variants ?? []).some(
      (variant) =>
        variant.is_active !== false &&
        String(variant.size ?? variant.variant_value).trim().toLowerCase() === size,
    );
    if (!hasSize) return false;
  }

  if (f.inStock && p.stock_quantity !== null && p.stock_quantity <= 0) return false;

  return true;
}

function sortProducts(items: Product[], sort: ProductFilters["sort"]): Product[] {
  const list = [...items];
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    case "name-asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "name-desc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case "newest":
      return list.sort(
        (a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
          (b.sort_index ?? 0) - (a.sort_index ?? 0),
      );
    default:
      return list.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  }
}

function uniqueSlug(base: string, all: Product[], ignoreId?: string): string {
  let candidate = base || "product";
  let i = 1;
  const taken = new Set(all.filter((p) => p.id !== ignoreId).map((p) => p.slug));
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  return candidate;
}

function withCategory(product: Product, categories: Category[]): Product {
  const category = product.category_id
    ? (categories.find((c) => c.id === product.category_id) ?? null)
    : null;
  return { ...product, category, category_name: category?.name ?? null };
}

export const localDriver: CatalogDriver = {
  mode: "local",

  async listProducts(filters = {}): Promise<Paginated<Product>> {
    const { categories, products } = readCatalog();
    const slugById = new Map(categories.map((c) => [c.id, c.slug]));
    const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);

    const filtered = products.filter((p) => matches(p, filters, slugById));
    const sorted = sortProducts(filtered, filters.sort ?? "newest");
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize).map((p) => withCategory(p, categories));

    return {
      items,
      total: sorted.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(sorted.length / pageSize)),
    };
  },

  async getProductBySlug(slug): Promise<Product | null> {
    const { categories, products, product_colours } = readCatalog();
    const found = products.find((p) => p.slug === slug && p.is_active);
    if (!found) return null;
    const hydrated = withPalette(found, categories, product_colours ?? []);
    return {
      ...hydrated,
      images: hydrated.primary_image_url
        ? [
            {
              id: `${hydrated.id}-img`,
              product_id: hydrated.id,
              image_url: hydrated.primary_image_url,
              storage_path: null,
              alt_text: hydrated.name,
              sort_order: 0,
            },
          ]
        : [],
    };
  },

  async getProductById(id): Promise<Product | null> {
    const { categories, products, product_colours } = readCatalog();
    const found = products.find((p) => p.id === id);
    return found ? withPalette(found, categories, product_colours ?? []) : null;
  },

  async getProductsByIds(ids): Promise<Product[]> {
    const { categories, products, product_colours } = readCatalog();
    const set = new Set(ids);
    return products
      .filter((p) => set.has(p.id))
      .map((p) => withPalette(p, categories, product_colours ?? []));
  },

  async listCategories(options = {}): Promise<Category[]> {
    const { categories, products } = readCatalog();
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.is_active === false) continue;
      if (!p.category_id) continue;
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    let list = categories.map((c) => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    if (options.activeOnly) list = list.filter((c) => c.is_active);
    return list;
  },

  async getCategoryBySlug(slug): Promise<Category | null> {
    const list = await this.listCategories();
    return list.find((c) => c.slug === slug) ?? null;
  },

  async getCategoryProductIds(categoryId: string): Promise<string[]> {
    const { products } = readCatalog();
    return products
      .filter((p) => p.category_id === categoryId)
      .map((p) => p.id);
  },

  async replaceCategoryProducts(categoryId: string, productIds: string[]): Promise<void> {
    const { categories, products, product_colours } = readCatalog();
    // In local mode, products have a single category_id. Clear previous assignments
    // to this category, then assign the selected ones.
    for (const p of products) {
      if (p.category_id === categoryId) {
        p.category_id = null;
      }
    }
    for (const id of productIds) {
      const idx = products.findIndex((p) => p.id === id);
      if (idx >= 0) products[idx].category_id = categoryId;
    }
    writeCatalog({ categories, products, product_colours });
  },

  async listProductsByCategory(
    categoryId: string,
    filters: ProductFilters = {},
  ): Promise<Paginated<Product>> {
    const { categories, products } = readCatalog();
    const assigned = products.filter((p) => p.category_id === categoryId && p.is_active);
    const slugById = new Map(categories.map((c) => [c.id, c.slug]));
    const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);

    let filtered = assigned.filter((p) => matches(p, filters, slugById));
    filtered = sortProducts(filtered, filters.sort ?? "newest");
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((p) => withCategory(p, categories));

    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
    };
  },

  async getColours(): Promise<string[]> {
    const { products } = readCatalog();
    const set = new Set<string>();
    for (const p of products) {
      if (p.is_active === false) continue;
      for (const c of p.colours) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  },

  async getSettings(): Promise<StoreSettings> {
    try {
      const stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<StoreSettings>;
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  /**
   * The local driver has no order records, so there is no sales data to rank
   * from. Returning an empty list hides the bestsellers section instead of
   * inventing a ranking.
   */
  async getBestsellerIds(): Promise<string[]> {
    return [];
  },

  async createProduct(input): Promise<Product> {
    const { categories, products, product_colours } = readCatalog();
    const slug = uniqueSlug(input.slug || input.name, products);
    const product: Product = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...input,
      slug,
      colours: input.colours ?? [],
      created_at: now(),
      updated_at: now(),
      sort_index: -Date.now(),
    };
    writeCatalog({ categories, products: [product, ...products], product_colours });
    return withPalette(product, categories, product_colours ?? []);
  },

  async updateProduct(id, input): Promise<Product> {
    const { categories, products, product_colours } = readCatalog();
    const idx = products.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Product not found");
    const current = products[idx];
    const slug =
      input.slug && input.slug !== current.slug
        ? uniqueSlug(input.slug, products, id)
        : current.slug;
    const updated: Product = { ...current, ...input, slug, updated_at: now() };
    products[idx] = updated;
    writeCatalog({ categories, products, product_colours });
    return withPalette(updated, categories, product_colours ?? []);
  },

  async deleteProduct(id): Promise<void> {
    const { categories, products, product_colours } = readCatalog();
    writeCatalog({
      categories,
      products: products.filter((p) => p.id !== id),
      product_colours,
    });
  },

  async createCategory(input): Promise<Category> {
    const { categories, products, product_colours } = readCatalog();
    const category: Category = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...input,
      created_at: now(),
      updated_at: now(),
      product_count: 0,
    };
    writeCatalog({ categories: [...categories, category], products, product_colours });
    return category;
  },

  async updateCategory(id, input): Promise<Category> {
    const { categories, products, product_colours } = readCatalog();
    const idx = categories.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("Category not found");
    const updated = { ...categories[idx], ...input, updated_at: now() };
    categories[idx] = updated;
    writeCatalog({ categories, products, product_colours });
    return updated;
  },

  async deleteCategory(id): Promise<void> {
    const { categories, products, product_colours } = readCatalog();
    const inUse = products.some((p) => p.category_id === id);
    if (inUse) {
      throw new Error("Category still has products. Reassign or remove them first.");
    }
    writeCatalog({
      categories: categories.filter((c) => c.id !== id),
      products,
      product_colours: (product_colours ?? []).filter((colour) => colour.category_id !== id),
    });
  },

  async listOrders(options = {}): Promise<Order[]> {
    const term = options.q?.trim().toLowerCase();
    const filtered = readOrders().filter((order) => {
      if (options.status && order.status !== options.status) return false;
      if (options.paymentStatus && order.payment_status !== options.paymentStatus) return false;
      if (!term) return true;
      return [order.order_number, order.customer_name, order.customer_phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
    return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async listOrdersPage(options = {}): Promise<Paginated<Order>> {
    const term = options.q?.trim().toLowerCase();
    const filtered = readOrders().filter((order) => {
      if (options.status && order.status !== options.status) return false;
      if (options.paymentStatus && order.payment_status !== options.paymentStatus) return false;
      if (!term) return true;
      return [order.order_number, order.customer_name, order.customer_phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
    const sorted = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const from = (page - 1) * pageSize;
    const total = sorted.length;

    return {
      items: sorted.slice(from, from + pageSize),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async getOrderStatusCounts(): Promise<Partial<Record<OrderStatus, number>>> {
    const counts: Partial<Record<OrderStatus, number>> = {};
    for (const order of readOrders()) {
      counts[order.status] = (counts[order.status] ?? 0) + 1;
    }
    return counts;
  },

  async getOrderById(id: string): Promise<Order | null> {
    const orders = readOrders();
    return orders.find((o) => o.id === id) ?? null;
  },

  async createOrder(input: OrderInput): Promise<Order> {
    const orders = readOrders();
    const timestamp = now();
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const order: Order = {
      id,
      order_number: nextOrderNumber(orders),
      customer_id: input.customerId,
      customer_name: input.customerName,
      customer_email: input.customerEmail ?? null,
      customer_phone: input.customerPhone,
      shipping_address: input.customerAddress,
      shipping_pincode: input.customerPincode ?? null,
      customer_state: input.customerState,
      status: "pending",
      payment_status: "pending",
      currency: input.currency,
      subtotal: input.subtotal,
      total_amount: input.subtotal,
      notes: input.notes,
      created_at: timestamp,
      updated_at: timestamp,
      items: input.items.map((item, index) => ({
        id: `${id}-item-${index + 1}`,
        order_id: id,
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        colour: item.colour ?? null,
        size: item.size ?? null,
        product_name_snapshot: item.productName,
        selected_variant_snapshot: item.variant,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.unitPrice * item.quantity,
      })),
    };
    writeOrders([order, ...orders]);
    return order;
  },

  async updateOrderStatus(id, status: OrderStatus): Promise<Order> {
    const orders = readOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx < 0) throw new Error("Enquiry not found");
    const updated: Order = { ...orders[idx], status, updated_at: now() };
    orders[idx] = updated;
    writeOrders(orders);
    return updated;
  },

  async updateOrderLifecycle(input: UpdateOrderLifecycleInput): Promise<Order> {
    const orders = readOrders();
    const idx = orders.findIndex((o) => o.id === input.orderId);
    if (idx < 0) throw new Error("Order not found");

    const timestamp = now();
    const current = orders[idx];
    const updated: Order = {
      ...current,
      updated_at: timestamp,
    };
    let statusChanged = false;

    if (input.status && input.status !== current.status) {
      assertValidTransition(current.status, input.status);
      updated.status = input.status;
      statusChanged = true;

      const stage = statusToDeliveryStage(input.status);
      if (stage) updated.delivery_stage = stage;

      if (input.status === "confirmed" && !current.confirmed_at) updated.confirmed_at = timestamp;
      if (input.status === "processing" && !current.processing_at) updated.processing_at = timestamp;
      if (input.status === "shipped" && !current.shipped_at) updated.shipped_at = timestamp;
      if (input.status === "delivered" && !current.delivered_at) updated.delivered_at = timestamp;
      if (input.status === "cancelled" && !current.cancelled_at) updated.cancelled_at = timestamp;
    }

    if (input.deliveryStage !== undefined) updated.delivery_stage = input.deliveryStage;
    const courierName =
      input.courierName !== undefined ? input.courierName : input.courierPartner;
    if (courierName !== undefined) {
      updated.courier_name = courierName;
      updated.courier_partner = courierName;
    }
    const trackingNumber =
      input.trackingNumber !== undefined ? input.trackingNumber : input.trackingId;
    if (trackingNumber !== undefined) {
      updated.tracking_number = trackingNumber;
      updated.tracking_id = trackingNumber;
    }
    if (input.trackingUrl !== undefined) updated.courier_tracking_url = input.trackingUrl;
    if (input.estimatedDelivery !== undefined) {
      updated.estimated_delivery = input.estimatedDelivery;
    }
    if (input.paymentStatus) updated.payment_status = input.paymentStatus;
    if (
      input.courierName !== undefined ||
      input.courierPartner !== undefined ||
      input.trackingNumber !== undefined ||
      input.trackingId !== undefined ||
      input.trackingUrl !== undefined ||
      input.estimatedDelivery !== undefined
    ) {
      updated.tracking_updated_at = timestamp;
    }

    orders[idx] = updated;
    writeOrders(orders);

    if (statusChanged && input.status) {
      const message =
        input.customerMessage?.trim() ||
        DEFAULT_STATUS_MESSAGES[input.status] ||
        ORDER_STATUS_LABELS[input.status] ||
        "Order status updated.";
      const history = readOrderHistory();
      history.push({
        id: `local-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        order_id: updated.id,
        previous_status: current.status,
        new_status: input.status,
        customer_message: message,
        internal_note: input.internalNote?.trim() || null,
        courier_name: courierName ?? current.courier_name ?? null,
        tracking_number: trackingNumber ?? current.tracking_number ?? null,
        tracking_url: input.trackingUrl ?? current.courier_tracking_url ?? null,
        estimated_delivery: input.estimatedDelivery ?? current.estimated_delivery ?? null,
        updated_by: input.updatedBy,
        created_at: timestamp,
      });
      writeOrderHistory(history);

      if (updated.customer_id) {
        const notifications = readNotifications();
        notifications.push({
          id: `local-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          customer_id: updated.customer_id,
          order_id: updated.id,
          title: `Order ${ORDER_STATUS_LABELS[input.status] ?? input.status}`,
          message,
          notification_type: "order_status",
          is_read: false,
          read_at: null,
          created_at: timestamp,
        });
        writeNotifications(notifications);
      }
    }

    return updated;
  },

  async updateVariantStock(
    variantId: string,
    stockQuantity: number | null,
  ): Promise<void> {
    const catalog = readCatalog();
    const productIdx = catalog.products.findIndex((p) =>
      p.variants?.some((v) => v.id === variantId),
    );
    if (productIdx < 0) throw new Error("Product not found for variant");
    const variants = catalog.products[productIdx].variants;
    const variantIdx = variants?.findIndex((v) => v.id === variantId) ?? -1;
    if (variantIdx < 0) throw new Error("Variant not found");
    variants![variantIdx].stock_quantity = stockQuantity;
    variants![variantIdx].updated_at = new Date().toISOString();
    writeCatalog(catalog);
  },

  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    const catalog = readCatalog();
    const product = catalog.products.find((p) => p.id === productId);
    if (!product) return [];
    return (product.variants ?? [])
      .filter((v) => v.is_active)
      .sort(
        (a, b) =>
          (a.colour ?? "").localeCompare(b.colour ?? "") ||
          a.variant_value.localeCompare(b.variant_value),
      );
  },

  async createVariant(
    productId: string,
    variant: ProductVariantInput,
  ): Promise<ProductVariant> {
    const catalog = readCatalog();
    const productIdx = catalog.products.findIndex((p) => p.id === productId);
    if (productIdx < 0) throw new Error("Product not found");
    const newVariant: ProductVariant = {
      id: `new-${Date.now()}`,
      product_id: productId,
      variant_name: variant.variant_name,
      variant_value: variant.variant_value,
      colour: variant.colour ?? null,
      colour_hex: variant.colour_hex ?? null,
      size: variant.size ?? null,
      image_url: variant.image_url ?? null,
      sku: variant.sku ?? null,
      stock_quantity: variant.stock_quantity ?? null,
      price_override: variant.price_override ?? null,
      is_active: variant.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!catalog.products[productIdx].variants) {
      catalog.products[productIdx].variants = [];
    }
    catalog.products[productIdx].variants.push(newVariant);
    writeCatalog(catalog);
    return newVariant;
  },

  async updateVariant(
    variantId: string,
    variant: Partial<ProductVariantInput>,
  ): Promise<ProductVariant> {
    const catalog = readCatalog();
    const productIdx = catalog.products.findIndex((p) =>
      p.variants?.some((v) => v.id === variantId),
    );
    if (productIdx < 0) throw new Error("Product not found for variant");
    const variants = catalog.products[productIdx].variants ?? [];
    const variantIdx = variants.findIndex((v) => v.id === variantId);
    if (variantIdx < 0) throw new Error("Variant not found");

    const next: ProductVariant = {
      ...variants[variantIdx],
      ...Object.fromEntries(
        Object.entries(variant).filter(([, value]) => value !== undefined),
      ),
      updated_at: new Date().toISOString(),
    };
    variants[variantIdx] = next;
    catalog.products[productIdx].variants = variants;
    writeCatalog(catalog);
    return next;
  },

  async listProductColours(categoryId: string): Promise<ProductColour[]> {
    const catalog = readCatalog();
    const stored = (catalog.product_colours ?? []).filter(
      (colour) => colour.category_id === categoryId,
    );
    if (stored.length) {
      return [...stored].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    }

    const category = catalog.categories.find((c) => c.id === categoryId);
    if (!category || !/glass/i.test(category.name)) return [];
    return GLASS_COLOUR_PALETTE.map((colour, index) => ({
      id: `local-glass-${index}`,
      category_id: categoryId,
      name: colour.name,
      hex_code: colour.hex,
      image_url: null,
      is_active: true,
      sort_order: index,
    }));
  },

  async syncProductColours(
    categoryId: string,
    colours: ProductColourInput[],
  ): Promise<ProductColour[]> {
    const catalog = readCatalog();
    const existing = catalog.product_colours ?? [];
    const kept = new Set<string>();
    const saved: ProductColour[] = [];

    for (const [index, colour] of colours.entries()) {
      const name = colour.name.trim();
      const match =
        (colour.id ? existing.find((row) => row.id === colour.id) : undefined) ??
        existing.find(
          (row) =>
            row.category_id === categoryId &&
            row.name.trim().toLowerCase() === name.toLowerCase(),
        );
      const next: ProductColour = match
        ? {
            ...match,
            name,
            hex_code: colour.hex_code,
            image_url: colour.image_url ?? null,
            is_active: colour.is_active ?? true,
            sort_order: colour.sort_order ?? index,
            updated_at: now(),
          }
        : {
            id: `local-colour-${Date.now()}-${index}`,
            category_id: categoryId,
            name,
            hex_code: colour.hex_code,
            image_url: colour.image_url ?? null,
            is_active: colour.is_active ?? true,
            sort_order: colour.sort_order ?? index,
            created_at: now(),
            updated_at: now(),
          };
      kept.add(next.id);
      saved.push(next);
    }

    const nextAll = [
      ...existing
        .filter((row) => row.category_id !== categoryId)
        .concat(saved),
      ...existing
        .filter(
          (row) =>
            row.category_id === categoryId && !kept.has(row.id) && row.is_active,
        )
        .map((row) => ({ ...row, is_active: false, updated_at: now() })),
    ];

    writeCatalog({ ...catalog, product_colours: nextAll });
    return saved;
  },

  async deleteVariant(variantId: string): Promise<void> {
    const catalog = readCatalog();
    const productIdx = catalog.products.findIndex((p) =>
      p.variants?.some((v) => v.id === variantId),
    );
    if (productIdx < 0) throw new Error("Product not found for variant");
    catalog.products[productIdx].variants = (
      catalog.products[productIdx].variants ?? []
    ).filter((v) => v.id !== variantId);
    writeCatalog(catalog);
  },

  async deleteProductVariants(productId: string): Promise<void> {
    const catalog = readCatalog();
    const productIdx = catalog.products.findIndex((p) => p.id === productId);
    if (productIdx < 0) throw new Error("Product not found");
    catalog.products[productIdx].variants = [];
    writeCatalog(catalog);
  },

  async listOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    return readOrderHistory()
      .filter((h) => h.order_id === orderId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async listOrderStatusHistoryForOrders(orderIds: string[]): Promise<OrderStatusHistory[]> {
    const wanted = new Set(orderIds);
    return readOrderHistory()
      .filter((h) => wanted.has(h.order_id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async listCustomerOrders(customerId: string): Promise<Order[]> {
    return readOrders()
      .filter((o) => o.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getCustomerOrderById(customerId: string, id: string): Promise<Order | null> {
    const order = readOrders().find((o) => o.id === id && o.customer_id === customerId) ?? null;
    return order;
  },

  async listCustomerNotifications(customerId: string): Promise<CustomerNotification[]> {
    return readNotifications()
      .filter((n) => n.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async markCustomerNotificationRead(id: string, customerId: string): Promise<boolean> {
    const notifications = readNotifications();
    const idx = notifications.findIndex((n) => n.id === id && n.customer_id === customerId);
    if (idx < 0) return false;
    notifications[idx] = { ...notifications[idx], is_read: true, read_at: now() };
    writeNotifications(notifications);
    return true;
  },

  async updateSettings(input): Promise<StoreSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...input };
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
    return next;
  },
};
