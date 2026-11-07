import "server-only";

import { unstable_cache } from "next/cache";

import { DEFAULT_SETTINGS } from "@/lib/site";
import { getAnonServerClient } from "@/lib/supabase/anon-server";
import type {
  Category,
  CustomerNotification,
  Order,
  OrderStatus,
  OrderStatusHistory,
  Paginated,
  Product,
  ProductColour,
  ProductFilters,
  ProductVariant,
  StoreSettings,
  UpdateOrderLifecycleInput,
} from "@/types";

import type {
  CatalogDriver,
  ProductColourInput,
  ProductVariantInput,
} from "./driver";
import { decodeHtmlEntities, normalizeDescription } from "./text";

/** Strips characters that carry meaning in PostgREST `or=` filter syntax. */
function sanitizeSearch(value: string): string {
  return value.replace(/[%,()'"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Cached public data that changes rarely and is read on many pages.
 * `unstable_cache` scopes by tags so admin updates can purge it later.
 */

const getSettingsCached = unstable_cache(
  async (): Promise<StoreSettings> => {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase.from("store_settings").select("key, value");
    if (error || !data) return { ...DEFAULT_SETTINGS };
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of data as { key: string; value: unknown }[]) {
      if (row.key in merged) merged[row.key] = row.value;
    }
    return merged as unknown as StoreSettings;
  },
  ["store-settings"],
  { revalidate: 3600 },
);

const listCategoriesCached = unstable_cache(
  async (activeOnly: boolean): Promise<Category[]> => {
    const supabase = getAnonServerClient();
    let query = supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return [];

    const { data: assignments } = await supabase
      .from("category_products")
      .select("category_id")
      .not("category_id", "is", null);

    const counts = new Map<string, number>();
    for (const row of assignments ?? []) {
      const cid = (row as { category_id: string }).category_id;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    if (counts.size === 0) {
      const { data: products } = await supabase
        .from("products")
        .select("category_id")
        .eq("is_active", true)
        .not("category_id", "is", null);
      for (const row of products ?? []) {
        const cid = (row as { category_id: string }).category_id;
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
    }

    return (data ?? []).map((row) => hydrateCategory({
      ...(row as unknown as Category),
      product_count: counts.get(row.id) ?? 0,
    }));
  },
  ["categories"],
  { revalidate: 3600 },
);

const PRODUCT_SELECT = "*, category:categories(*)";

/**
 * Palette rows are category-level, so the same handful of records is reused by
 * every product in that category. Caching by category id avoids an extra query
 * per product page render.
 */
const getCategoryColoursCached = unstable_cache(
  async (categoryId: string): Promise<ProductColour[]> => {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("product_colours")
      .select("*")
      .eq("category_id", categoryId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return [];
    return (data ?? []) as ProductColour[];
  },
  ["product-colours"],
  { revalidate: 3600, tags: ["products", "categories"] },
);

async function attachPalette(product: Product | null): Promise<Product | null> {
  if (!product) return null;
  product.colour_palette = product.category_id
    ? await getCategoryColoursCached(product.category_id)
    : [];
  return product;
}

const getProductBySlugCached = unstable_cache(
  async (slug: string): Promise<Product | null> => {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(`${PRODUCT_SELECT}, images:product_images(*), variants:product_variants(*)`)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`Failed to load product: ${error.message}`);
    return attachPalette(hydrate(data as Record<string, unknown> | null));
  },
  ["product"],
  { revalidate: 300, tags: ["products"] },
);

const getProductByIdCached = unstable_cache(
  async (id: string): Promise<Product | null> => {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(`${PRODUCT_SELECT}, images:product_images(*), variants:product_variants(*)`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load product: ${error.message}`);
    return attachPalette(hydrate(data as Record<string, unknown> | null));
  },
  ["product"],
  { revalidate: 300, tags: ["products"] },
);

/**
 * Minimal structural view of a PostgREST filter builder. Supabase's fluent
 * generics are impossible to thread through a helper, so call sites hand the
 * builder in and get the same builder back.
 */
interface FilterBuilder {
  eq: (column: string, value: unknown) => FilterBuilder;
  gte: (column: string, value: unknown) => FilterBuilder;
  lte: (column: string, value: unknown) => FilterBuilder;
  or: (filters: string) => FilterBuilder;
  contains: (column: string, value: unknown) => FilterBuilder;
  in: (column: string, values: unknown[]) => FilterBuilder;
  order: (column: string, options?: { ascending?: boolean }) => FilterBuilder;
  range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: unknown; count: number | null }>;
}

function applyFilters<T>(query: T, filters: ProductFilters): T {
  let q = query as unknown as FilterBuilder;

  if (!filters.include_inactive) q = q.eq("is_active", true);
  if (filters.featured) q = q.eq("is_featured", true);
  if (filters.new_arrivals) q = q.eq("is_new_arrival", true);
  if (typeof filters.minPrice === "number") q = q.gte("price", filters.minPrice);
  if (typeof filters.maxPrice === "number") q = q.lte("price", filters.maxPrice);
  if (filters.ids?.length) q = q.in("id", filters.ids);
  if (filters.colour?.length) q = q.contains("colours", filters.colour);
  if (filters.inStock) q = q.or("stock_quantity.is.null,stock_quantity.gt.0");

  if (filters.q) {
    const term = sanitizeSearch(filters.q);
    if (term) {
      q = q.or(
        `name.ilike.%${term}%,description.ilike.%${term}%,sku.ilike.%${term}%`,
      );
    }
  }

  const sortMap: Record<string, [string, "asc" | "desc"]> = {
    newest: ["created_at", "desc"],
    "price-asc": ["price", "asc"],
    "price-desc": ["price", "desc"],
    "name-asc": ["name", "asc"],
    "name-desc": ["name", "desc"],
  };
  const [column, dir] = sortMap[filters.sort ?? "newest"] ?? sortMap.newest;
  q = q.order(column, { ascending: dir === "asc" });

  return q as unknown as T;
}

function hydrate(row: Record<string, unknown> | null): Product | null {
  if (!row) return null;
  const category = (row.category ?? null) as Category | null;
  const product = row as unknown as Product;
  return {
    ...product,
    name: decodeHtmlEntities(product.name),
    description: normalizeDescription(product.description),
    seo_title: product.seo_title ? decodeHtmlEntities(product.seo_title) : product.seo_title,
    seo_description: product.seo_description
      ? decodeHtmlEntities(product.seo_description)
      : product.seo_description,
    category,
    category_name: category?.name ?? null,
  };
}

/** Decodes migrated HTML entities in a category's displayed text. */
function hydrateCategory(category: Category): Category {
  return {
    ...category,
    name: decodeHtmlEntities(category.name),
    description: category.description ? decodeHtmlEntities(category.description) : category.description,
  };
}

export const supabaseDriver: CatalogDriver = {
  mode: "supabase",

  async listProducts(filters = {}): Promise<Paginated<Product>> {
    const supabase = getAnonServerClient();
    const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);

    let productIds: string[] | null = null;
    if (filters.category) {
      const { data } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", filters.category)
        .maybeSingle();
      const categoryId = data?.id;
      if (categoryId) {
        const { data: assigned } = await supabase
          .from("category_products")
          .select("product_id")
          .eq("category_id", categoryId);
        productIds = (assigned ?? []).map((row) => row.product_id);

        // Fallback: legacy products.category_id if junction table is empty.
        if (!productIds.length) {
          const { data: legacy } = await supabase
            .from("products")
            .select("id")
            .eq("category_id", categoryId);
          productIds = (legacy ?? []).map((row) => row.id);
        }

        if (!productIds.length) {
          return { items: [], total: 0, page, pageSize, pageCount: 0 };
        }
      } else {
        return { items: [], total: 0, page, pageSize, pageCount: 0 };
      }
    }

    let base = filters.include_variants
      ? supabase
          .from("products")
          .select(`${PRODUCT_SELECT}, variants:product_variants(*)`, { count: "exact" })
      : supabase.from("products").select(PRODUCT_SELECT, { count: "exact" });
    if (productIds) base = base.in("id", productIds) as typeof base;
    base = applyFilters(base, filters) as typeof base;

    const from = (page - 1) * pageSize;
    const { data, error, count } = await base.range(from, from + pageSize - 1);
    if (error) {
      return { items: [], total: 0, page, pageSize, pageCount: 0 };
    }

    const total = count ?? 0;
    return {
      items: (data ?? []).map((row) => hydrate(row as Record<string, unknown>)).filter(Boolean) as Product[],
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async getProductBySlug(slug: string): Promise<Product | null> {
    return getProductBySlugCached(slug);
  },

  async getProductById(id: string): Promise<Product | null> {
    return getProductByIdCached(id);
  },

  async getProductsByIds(ids): Promise<Product[]> {
    if (!ids.length) return [];
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(`${PRODUCT_SELECT}, variants:product_variants(*)`)
      .in("id", ids);
    if (error) throw new Error(`Failed to load products: ${error.message}`);
    return (data ?? []).map((row) => hydrate(row as Record<string, unknown>)).filter(Boolean) as Product[];
  },

  async listCategories(options = {}): Promise<Category[]> {
    return listCategoriesCached(options.activeOnly ?? false);
  },

  async getCategoryBySlug(slug): Promise<Category | null> {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`Failed to load category: ${error.message}`);
    if (!data) return null;

    const { count } = await supabase
      .from("category_products")
      .select("id", { head: true, count: "exact" })
      .eq("category_id", data.id);

    // Fallback: count from legacy products.category_id if junction table is empty.
    let productCount = count ?? 0;
    if (productCount === 0) {
      const { count: legacyCount } = await supabase
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("category_id", data.id);
      productCount = legacyCount ?? 0;
    }

    return hydrateCategory({
      ...(data as unknown as Category),
      product_count: productCount,
    });
  },

  async getCategoryProductIds(categoryId: string): Promise<string[]> {
    const supabase = getAnonServerClient();

    // Prefer the junction table (source of truth after migration).
    const { data, error } = await supabase
      .from("category_products")
      .select("product_id")
      .eq("category_id", categoryId);
    if (!error && (data ?? []).length > 0) {
      return (data as { product_id: string }[]).map((row) => row.product_id);
    }

    // Fallback: legacy products.category_id column (pre-migration compatibility).
    const { data: legacy, error: legacyError } = await supabase
      .from("products")
      .select("id")
      .eq("category_id", categoryId);
    if (legacyError) return [];
    return (legacy ?? []).map((row) => row.id);
  },

  async replaceCategoryProducts(categoryId: string, productIds: string[]): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();

    const { error: deleteError } = await supabase
      .from("category_products")
      .delete()
      .eq("category_id", categoryId);
    if (deleteError) throw new Error(deleteError.message);

    if (productIds.length) {
      const rows = productIds.map((productId, index) => ({
        category_id: categoryId,
        product_id: productId,
        sort_order: index,
      }));
      const { error: insertError } = await supabase.from("category_products").insert(rows);
      if (insertError) throw new Error(insertError.message);
    }
  },

  async listProductsByCategory(
    categoryId: string,
    filters: ProductFilters = {},
  ): Promise<Paginated<Product>> {
    const supabase = getAnonServerClient();
    const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);

    // Get product ids assigned to this category
    let assignedIds = await this.getCategoryProductIds(categoryId);
    if (!assignedIds.length) {
      return { items: [], total: 0, page, pageSize, pageCount: 0 };
    }

    if (filters.size) {
      const { data: sizeRows, error: sizeError } = await supabase
        .from("product_variants")
        .select("product_id")
        .in("product_id", assignedIds)
        .eq("is_active", true)
        .eq("size", filters.size);
      if (sizeError) {
        return { items: [], total: 0, page, pageSize, pageCount: 0 };
      }
      const allowed = new Set((sizeRows ?? []).map((row) => row.product_id));
      assignedIds = assignedIds.filter((id) => allowed.has(id));
      if (!assignedIds.length) {
        return { items: [], total: 0, page, pageSize, pageCount: 0 };
      }
    }

    if (filters.inStock) {
      const { data: stockRows } = await supabase
        .from("product_variants")
        .select("product_id, stock_quantity")
        .in("product_id", assignedIds)
        .eq("is_active", true);
      const stockByProduct = new Map<string, (number | null)[]>();
      for (const row of stockRows ?? []) {
        const list = stockByProduct.get(row.product_id) ?? [];
        list.push(row.stock_quantity);
        stockByProduct.set(row.product_id, list);
      }
      assignedIds = assignedIds.filter((id) => {
        const stock = stockByProduct.get(id);
        if (!stock || stock.length === 0) return true;
        return stock.some((quantity) => quantity === null || quantity > 0);
      });
      if (!assignedIds.length) {
        return { items: [], total: 0, page, pageSize, pageCount: 0 };
      }
    }

    const base = supabase
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .in("id", assignedIds)
      .eq("is_active", true);

    // Apply search/sort/price filters
    let q = base as unknown as FilterBuilder;
    if (filters.q) {
      const term = sanitizeSearch(filters.q);
      if (term) {
        q = q.or(
          `name.ilike.%${term}%,description.ilike.%${term}%,sku.ilike.%${term}%`,
        );
      }
    }
    if (typeof filters.minPrice === "number") q = q.gte("price", filters.minPrice);
    if (typeof filters.maxPrice === "number") q = q.lte("price", filters.maxPrice);
    if (filters.colour?.length) q = q.contains("colours", filters.colour);
    if (filters.inStock) q = q.or("stock_quantity.is.null,stock_quantity.gt.0");

    const sortMap: Record<string, [string, "asc" | "desc"]> = {
      newest: ["created_at", "desc"],
      "price-asc": ["price", "asc"],
      "price-desc": ["price", "desc"],
      "name-asc": ["name", "asc"],
      "name-desc": ["name", "desc"],
    };
    const [column, dir] = sortMap[filters.sort ?? "newest"] ?? sortMap.newest;
    q = q.order(column, { ascending: dir === "asc" });

    const from = (page - 1) * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) {
      return { items: [], total: 0, page, pageSize, pageCount: 0 };
    }

    const total = count ?? 0;
    return {
      items: (data as Record<string, unknown>[] ?? []).map((row: Record<string, unknown>) => hydrate(row)).filter(Boolean) as Product[],
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async getColours(): Promise<string[]> {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("colours")
      .eq("is_active", true)
      .not("colours", "is", null)
      .limit(5000);
    if (error) return [];
    const set = new Set<string>();
    for (const row of data ?? []) {
      for (const c of (row as { colours: string[] }).colours ?? []) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  },

  async getSettings(): Promise<StoreSettings> {
    return getSettingsCached();
  },

  /**
   * Ranks products by summed `order_items.quantity`. Returns an empty list
   * when no order records exist, which hides the bestsellers section rather
   * than presenting an invented ranking.
   */
  async getBestsellerIds(limit = 8): Promise<string[]> {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .not("product_id", "is", null);
    if (error || !data?.length) return [];

    const totals = new Map<string, number>();
    for (const row of data as { product_id: string; quantity: number }[]) {
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  },

  async createProduct(input): Promise<Product> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("products")
      .insert(input)
      .select(PRODUCT_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return hydrate(data as Record<string, unknown>) as Product;
  },

  async updateProduct(id, input): Promise<Product> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("products")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(PRODUCT_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return hydrate(data as Record<string, unknown>) as Product;
  },

  async deleteProduct(id): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async createCategory(input): Promise<Category> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.from("categories").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data as Category;
  },

  async updateCategory(id, input): Promise<Category> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("categories")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Category;
  },

  async deleteCategory(id): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();

    // Check both the legacy products.category_id and the junction table.
    const [productCheck, assignmentCheck] = await Promise.all([
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      supabase
        .from("category_products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
    ]);
    if (((productCheck.count ?? 0) + (assignmentCheck.count ?? 0)) > 0) {
      throw new Error("Category still has products. Reassign or remove them first.");
    }

    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  /**
   * Orders are private to admins under RLS, so reads and writes both go through
   * the service-role client after the caller has passed an admin check.
   */
  async listOrders(options = {}): Promise<Order[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    let query = supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .order("created_at", { ascending: false });
    if (options.status) query = query.eq("status", options.status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list enquiries: ${error.message}`);
    return (data ?? []) as Order[];
  },

  async listOrdersPage(options = {}): Promise<Paginated<Order>> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (options.status) query = query.eq("status", options.status);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to list orders: ${error.message}`);

    const total = count ?? 0;
    return {
      items: (data ?? []) as Order[],
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async getOrderStatusCounts(): Promise<Partial<Record<OrderStatus, number>>> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.from("orders").select("status");
    if (error) throw new Error(`Failed to count orders: ${error.message}`);

    const counts: Partial<Record<OrderStatus, number>> = {};
    for (const row of (data ?? []) as { status: OrderStatus }[]) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  },

  async getOrderById(id: string): Promise<Order | null> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load order: ${error.message}`);
    return (data as Order) ?? null;
  },

  async createOrder(input): Promise<Order> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        shipping_address: input.customerAddress,
        customer_state: input.customerState,
        status: "pending",
        currency: input.currency,
        subtotal: input.subtotal,
        total_amount: input.subtotal,
        notes: input.notes,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const order = data as Order;
    if (input.items.length) {
      const rows = input.items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        colour: item.colour ?? null,
        size: item.size ?? null,
        product_name_snapshot: item.productName,
        selected_variant_snapshot: item.variant,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.unitPrice * item.quantity,
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(rows);
      if (itemsError) throw new Error(itemsError.message);
    }

    return order;
  },

  async updateOrderStatus(id, status: OrderStatus): Promise<Order> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Order;
  },

  async updateOrderLifecycle(input: UpdateOrderLifecycleInput): Promise<Order> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.deliveryStage !== undefined) update.delivery_stage = input.deliveryStage;
    if (input.courierPartner !== undefined) update.courier_partner = input.courierPartner;
    if (input.trackingId !== undefined) update.tracking_id = input.trackingId;
    if (input.deliveryStage || input.courierPartner || input.trackingId) {
      update.tracking_updated_at = now;
    }

    const { data, error } = await supabase
      .from("orders")
      .update(update)
      .eq("id", input.orderId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    return data as Order;
  },

  async updateVariantStock(
    variantId: string,
    stockQuantity: number | null,
  ): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from("product_variants")
      .update({ stock_quantity: stockQuantity, updated_at: new Date().toISOString() })
      .eq("id", variantId);
    if (error) throw new Error(error.message);
  },

  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("colour", { ascending: true })
      .order("variant_value", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProductVariant[];
  },

  async createVariant(
    productId: string,
    variant: ProductVariantInput,
  ): Promise<ProductVariant> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("product_variants")
      .insert({
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
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProductVariant;
  },

  async updateVariant(
    variantId: string,
    variant: Partial<ProductVariantInput>,
  ): Promise<ProductVariant> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of [
      "variant_name",
      "variant_value",
      "colour",
      "colour_hex",
      "size",
      "image_url",
      "sku",
      "price_override",
      "stock_quantity",
      "is_active",
    ] as const) {
      if (variant[key] !== undefined) update[key] = variant[key];
    }
    const { data, error } = await supabase
      .from("product_variants")
      .update(update)
      .eq("id", variantId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProductVariant;
  },

  async listProductColours(categoryId: string): Promise<ProductColour[]> {
    const supabase = getAnonServerClient();
    const { data, error } = await supabase
      .from("product_colours")
      .select("*")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return [];
    return (data ?? []) as ProductColour[];
  },

  async syncProductColours(
    categoryId: string,
    colours: ProductColourInput[],
  ): Promise<ProductColour[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data: existing, error: readError } = await supabase
      .from("product_colours")
      .select("*")
      .eq("category_id", categoryId);
    if (readError) throw new Error(readError.message);

    const existingRows = (existing ?? []) as ProductColour[];
    const keep = new Set<string>();
    const saved: ProductColour[] = [];

    for (const [index, colour] of colours.entries()) {
      const match =
        (colour.id ? existingRows.find((row) => row.id === colour.id) : undefined) ??
        existingRows.find(
          (row) => row.name.trim().toLowerCase() === colour.name.trim().toLowerCase(),
        );

      const payload = {
        category_id: categoryId,
        name: colour.name.trim(),
        hex_code: colour.hex_code,
        image_url: colour.image_url ?? null,
        is_active: colour.is_active ?? true,
        sort_order: colour.sort_order ?? index,
        updated_at: new Date().toISOString(),
      };

      if (match) {
        keep.add(match.id);
        const { data, error } = await supabase
          .from("product_colours")
          .update(payload)
          .eq("id", match.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        saved.push(data as ProductColour);
      } else {
        const { data, error } = await supabase
          .from("product_colours")
          .insert(payload)
          .select()
          .single();
        if (error) throw new Error(error.message);
        saved.push(data as ProductColour);
      }
    }

    // Deactivate palette entries that were removed from the form instead of
    // deleting them. Existing products keep their historical colour names.
    const staleIds = existingRows
      .filter((row) => !keep.has(row.id) && row.is_active)
      .map((row) => row.id);
    if (staleIds.length) {
      const { error } = await supabase
        .from("product_colours")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", staleIds);
      if (error) throw new Error(error.message);
    }

    return saved;
  },

  async deleteVariant(variantId: string): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", variantId);
    if (error) throw new Error(error.message);
  },

  async deleteProductVariants(productId: string): Promise<void> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId);
    if (error) throw new Error(error.message);
  },

  async listOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as OrderStatusHistory[];
  },

  async listCustomerOrders(customerId: string): Promise<Order[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Order[];
  },

  async getCustomerOrderById(customerId: string, id: string): Promise<Order | null> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .eq("id", id)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Order) ?? null;
  },

  async listCustomerNotifications(customerId: string): Promise<CustomerNotification[]> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("customer_notifications")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CustomerNotification[];
  },

  async markCustomerNotificationRead(id: string, customerId: string): Promise<boolean> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const { error } = await supabase
      .from("customer_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("customer_id", customerId);
    if (error) throw new Error(error.message);
    return true;
  },

  async updateSettings(input): Promise<StoreSettings> {
    const { getServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = getServiceRoleClient();
    const rows = Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({ key, value }));
    if (rows.length) {
      const { error } = await supabase.from("store_settings").upsert(rows, { onConflict: "key" });
      if (error) throw new Error(error.message);
    }
    return this.getSettings();
  },
};
