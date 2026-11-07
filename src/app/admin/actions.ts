"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  AdminAccessError,
  requireAdminAccess,
} from "@/lib/admin/access";
import { getCatalog } from "@/lib/data";
import { normalizeImageSource } from "@/lib/images/url";
import { isGlassBanglesCategory } from "@/lib/product-sizes";
import { assertValidTransition } from "@/lib/orders/lifecycle";
import { getServiceRoleClient, isServiceRoleConfigured } from "@/lib/supabase/service-role";
import {
  categoryInputSchema,
  productInputSchema,
  settingsUpdateSchema,
} from "@/lib/validation";
import type { ActionState } from "@/lib/admin/action-state";
import type {
  ColourImage,
  OrderStatus,
  Product,
  Paginated,
  ProductFilters,
  ProductVariant,
} from "@/types";
import type { ProductColourInput, ProductVariantInput } from "@/lib/data/driver";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "delivery_failed",
  "return_requested",
  "return_approved",
  "return_rejected",
  "refund_initiated",
  "refunded",
  "payment_pending",
  "payment_failed",
  "stock_unavailable",
  "returned",
];

function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function revalidateStorefront(): void {
  revalidatePath("/", "layout");
}

function revalidateInventory(productId: string): void {
  revalidateTag("products", { expire: 0 });
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
}

/** Converts an empty form value into `null` so optional numeric/string fields clear. */
function optionalString(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const text = optionalString(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseColours(value: FormDataEntryValue | null): string[] {
  const text = optionalString(value);
  if (!text) return [];
  return [...new Set(text.split(",").map((c) => c.trim()).filter(Boolean))];
}

function parseJsonArray(value: FormDataEntryValue | null): unknown[] {
  const text = optionalString(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseColourImages(value: FormDataEntryValue | null): ColourImage[] {
  const seen = new Set<string>();
  const images: ColourImage[] = [];
  for (const entry of parseJsonArray(value)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { colour?: unknown; image_url?: unknown };
    const colour = typeof row.colour === "string" ? row.colour.trim() : "";
    const imageUrl = typeof row.image_url === "string" ? row.image_url.trim() : "";
    if (!colour || !imageUrl) continue;
    const key = colour.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    images.push({ colour, image_url: imageUrl });
  }
  return images;
}

interface ParsedVariant {
  id: string | null;
  input: ProductVariantInput;
}

function parseVariants(value: FormDataEntryValue | null): {
  variants: ParsedVariant[];
  error: string | null;
} {
  const variants: ParsedVariant[] = [];
  const seen = new Set<string>();

  for (const entry of parseJsonArray(value)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const size =
      typeof row.size === "string" && row.size.trim()
        ? row.size.trim()
        : typeof row.variant_value === "string"
          ? row.variant_value.trim()
          : "";
    const colour =
      typeof row.colour === "string" && row.colour.trim() ? row.colour.trim() : null;
    if (!size) {
      return { variants: [], error: "Every colour/size option needs a size." };
    }

    const key = `${(colour ?? "").toLowerCase()}::${size.toLowerCase()}`;
    if (seen.has(key)) {
      return {
        variants: [],
        error: `${colour ? `${colour} — ` : ""}${size} is listed more than once.`,
      };
    }
    seen.add(key);

    const stockRaw = row.stock_quantity;
    const stock =
      stockRaw === null || stockRaw === undefined || stockRaw === ""
        ? null
        : Number(stockRaw);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      return { variants: [], error: "Stock must be a whole number of 0 or more." };
    }

    const priceRaw = row.price_override;
    const price =
      priceRaw === null || priceRaw === undefined || priceRaw === ""
        ? null
        : Number(priceRaw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return { variants: [], error: "Price overrides must be zero or more." };
    }

    const colourHex =
      typeof row.colour_hex === "string" && row.colour_hex.trim()
        ? row.colour_hex.trim()
        : null;
    const imageUrl =
      typeof row.image_url === "string" && row.image_url.trim()
        ? row.image_url.trim()
        : null;
    const sku = typeof row.sku === "string" && row.sku.trim() ? row.sku.trim() : null;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;

    variants.push({
      id,
      input: {
        variant_name:
          typeof row.variant_name === "string" && row.variant_name.trim()
            ? row.variant_name.trim()
            : "Size",
        variant_value: size,
        size,
        colour,
        colour_hex: colourHex,
        image_url: imageUrl,
        sku,
        stock_quantity: stock,
        price_override: price,
        is_active: row.is_active === false ? false : true,
      },
    });
  }

  return { variants, error: null };
}

function parsePalette(value: FormDataEntryValue | null): {
  colours: ProductColourInput[];
  error: string | null;
} {
  const colours: ProductColourInput[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of parseJsonArray(value).entries()) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    if (name.length > 40) {
      return { colours: [], error: "Colour names must be 40 characters or fewer." };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const hex =
      typeof row.hex_code === "string" && /^#[0-9a-f]{6}$/i.test(row.hex_code.trim())
        ? row.hex_code.trim()
        : "#C9A227";
    const imageUrl =
      typeof row.image_url === "string" && row.image_url.trim()
        ? row.image_url.trim()
        : null;

    colours.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : undefined,
      name,
      hex_code: hex,
      image_url: imageUrl,
      is_active: row.is_active === false ? false : true,
      sort_order: index,
    });
  }

  return { colours, error: null };
}

async function syncProductVariants(
  productId: string,
  parsed: ParsedVariant[],
  existing: ProductVariant[],
): Promise<void> {
  const catalog = getCatalog();
  const existingIds = new Set(existing.map((variant) => variant.id));
  const submittedIds = new Set<string>();

  for (const variant of parsed) {
    if (variant.id && existingIds.has(variant.id)) {
      await catalog.updateVariant(variant.id, variant.input);
      submittedIds.add(variant.id);
    } else {
      const created = await catalog.createVariant(productId, variant.input);
      submittedIds.add(created.id);
    }
  }

  // The form submits the complete set of options, so anything omitted was
  // deliberately removed. Stock rows that remain keep their original ids and
  // counts (no delete-and-recreate reset).
  for (const variant of existing) {
    if (!submittedIds.has(variant.id)) {
      await catalog.deleteVariant(variant.id);
    }
  }
}

async function resolveImageUrl(
  formData: FormData,
  fallback: string | null,
): Promise<{ url: string | null } | { error: string }> {
  const file = formData.get("image_file");
  if (file instanceof File && file.size > 0) {
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Image upload needs Supabase Storage. Configure SUPABASE_SERVICE_ROLE_KEY, or paste an image URL instead.",
      };
    }
    if (!file.type.startsWith("image/")) {
      return { error: "The uploaded file must be an image." };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { error: "Images must be 5 MB or smaller." };
    }
    try {
      const supabase = getServiceRoleClient();
      const safeName = file.name.replace(/[^\w.-]+/g, "-").toLowerCase();
      const path = `uploads/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) return { error: `Upload failed: ${error.message}` };
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      const publicUrl = normalizeImageSource(data.publicUrl);
      if (!publicUrl) return { error: "Upload succeeded but the image URL was invalid." };
      return { url: publicUrl };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Upload failed." };
    }
  }
  const pasted =
    optionalString(formData.get("primary_image_url")) ??
    optionalString(formData.get("image_url"));
  if (pasted) {
    const normalized = normalizeImageSource(pasted);
    if (!normalized) {
      return { error: "Enter a valid image URL or upload a file." };
    }
    return { url: normalized };
  }
  return { url: fallback ? normalizeImageSource(fallback) : null };
}

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let id: string | null = null;
  try {
    await requireAdminAccess();

    id = optionalString(formData.get("id"));
    const existing = id ? await getCatalog().getProductById(id) : null;

    const image = await resolveImageUrl(formData, existing?.primary_image_url ?? null);
    if ("error" in image) {
      return { status: "error", message: image.error, fieldErrors: { primary_image_url: image.error } };
    }

    const raw = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: formData.get("description"),
      sku: optionalString(formData.get("sku")),
      price: formData.get("price"),
      compare_at_price: optionalNumber(formData.get("compare_at_price")),
      stock_quantity: optionalNumber(formData.get("stock_quantity")),
      category_id: optionalString(formData.get("category_id")),
      primary_image_url: image.url,
      colours: parseColours(formData.get("colours")),
      colour_images:
        formData.get("colour_images_json") === null
          ? (existing?.colour_images ?? [])
          : parseColourImages(formData.get("colour_images_json")),
      is_active: formData.get("is_active") === "on",
      is_featured: formData.get("is_featured") === "on",
      is_new_arrival: formData.get("is_new_arrival") === "on",
      seo_title: optionalString(formData.get("seo_title")),
      seo_description: optionalString(formData.get("seo_description")),
    };

    const parsed = productInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    if (parsed.data.category_id && parsed.data.colours.length !== 1) {
      const categories = await getCatalog().listCategories();
      const category = categories.find((item) => item.id === parsed.data.category_id);
      if (category && isGlassBanglesCategory(category.name)) {
        return {
          status: "error",
          message: "Glass Bangles products must have exactly one colour.",
          fieldErrors: { colours: "Choose exactly one colour for this product." },
        };
      }
    }

    const variantsJson = formData.get("variants_json");
    const parsedVariants =
      variantsJson === null ? null : parseVariants(variantsJson);
    if (parsedVariants?.error) {
      return {
        status: "error",
        message: parsedVariants.error,
        fieldErrors: { variants: parsedVariants.error },
      };
    }

    const catalog = getCatalog();
    if (id) {
      await catalog.updateProduct(id, parsed.data);
    } else {
      const created = await catalog.createProduct(parsed.data);
      id = created.id;
    }

    if (id && parsedVariants) {
      await syncProductVariants(id, parsedVariants.variants, existing?.variants ?? []);
    }

    revalidateTag("products", { expire: 0 });
    revalidateStorefront();
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not save the product.",
    };
  }

  redirect("/admin/products?saved=1");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const id = optionalString(formData.get("id"));
  if (!id) return;
  await getCatalog().deleteProduct(id);
  revalidateStorefront();
  redirect("/admin/products?deleted=1");
}

export async function saveCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let id: string | null = null;
  try {
    await requireAdminAccess();
    id = optionalString(formData.get("id"));

    const catalog = getCatalog();
    const existingCategory = id
      ? (await catalog.listCategories()).find((category) => category.id === id) ?? null
      : null;
    const image = await resolveImageUrl(formData, existingCategory?.image_url ?? null);
    if ("error" in image) {
      return { status: "error", message: image.error, fieldErrors: { image_url: image.error } };
    }

    const raw = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: optionalString(formData.get("description")),
      image_url: image.url,
      sort_order: formData.get("sort_order") ?? 0,
      is_active: formData.get("is_active") === "on",
    };

    const parsed = categoryInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    let savedCategory: { id: string } | null = null;
    if (id) {
      await catalog.updateCategory(id, parsed.data);
      savedCategory = { id };
    } else {
      const created = await catalog.createCategory(parsed.data);
      savedCategory = { id: created.id };
    }

    // Save product assignments for this category (new or existing)
    if (savedCategory) {
      const productIdsParam = optionalString(formData.get("category_product_ids"));
      const productIds = productIdsParam
        ? productIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      await catalog.replaceCategoryProducts(savedCategory.id, productIds);

      const paletteValue = formData.get("colour_palette_json");
      if (paletteValue !== null) {
        const palette = parsePalette(paletteValue);
        if (palette.error) {
          return {
            status: "error",
            message: palette.error,
            fieldErrors: { colour_palette: palette.error },
          };
        }
        await catalog.syncProductColours(savedCategory.id, palette.colours);
      }
    }

    revalidateTag("products", { expire: 0 });
    revalidateTag("categories", { expire: 0 });
    revalidateStorefront();
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not save the category.",
    };
  }

  redirect("/admin/categories?saved=1");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const id = optionalString(formData.get("id"));
  if (!id) return;
  try {
    await getCatalog().deleteCategory(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete the category.";
    redirect(`/admin/categories?error=${encodeURIComponent(message)}`);
  }
  revalidateStorefront();
  redirect("/admin/categories?deleted=1");
}

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAccess();

    const raw = {
      store_name: formData.get("store_name") ?? undefined,
      whatsapp_number: optionalString(formData.get("whatsapp_number")),
      contact_email: optionalString(formData.get("contact_email")),
      currency: optionalString(formData.get("currency")) ?? "INR",
      announcement: optionalString(formData.get("announcement")),
      shipping_info: optionalString(formData.get("shipping_info")),
      footer_note: optionalString(formData.get("footer_note")),
      facebook_url: optionalString(formData.get("facebook_url")),
      instagram_url: optionalString(formData.get("instagram_url")),
      youtube_url: optionalString(formData.get("youtube_url")),
      pinterest_url: optionalString(formData.get("pinterest_url")),
      location: optionalString(formData.get("location")),
      seo_title_template: optionalString(formData.get("seo_title_template")),
      seo_default_description: optionalString(formData.get("seo_default_description")),
      free_shipping_threshold: optionalNumber(formData.get("free_shipping_threshold")),
    };

    const parsed = settingsUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        message: "Please correct the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    await getCatalog().updateSettings(parsed.data);
    revalidateStorefront();

    return { status: "success", message: "Settings saved." };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not save settings.",
    };
  }
}

export async function getCategoryAssignmentProducts(categoryId: string): Promise<Product[]> {
  await requireAdminAccess();
  const catalog = getCatalog();
  const productIds = await catalog.getCategoryProductIds(categoryId);
  if (!productIds.length) return [];
  return catalog.getProductsByIds(productIds);
}

export async function searchAssignableProducts({
  q,
  page,
  pageSize,
  sort,
}: {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: ProductFilters["sort"];
}): Promise<Paginated<Product>> {
  await requireAdminAccess();
  const catalog = getCatalog();
  return catalog.listProducts({
    q,
    page: page ?? 1,
    pageSize: pageSize ?? 24,
    sort: sort ?? "newest",
    include_inactive: true,
  });
}

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const id = optionalString(formData.get("id"));
  const status = optionalString(formData.get("status")) as OrderStatus | null;
  if (!id || !status || !ORDER_STATUSES.includes(status)) {
    redirect("/admin/orders?error=1");
  }
  try {
    const catalog = getCatalog();
    const order = await catalog.getOrderById(id);
    if (!order) {
      redirect("/admin/orders?error=1");
    }
    if (order.status !== status) {
      assertValidTransition(order.status, status);
      await catalog.updateOrderStatus(id, status);
    }
  } catch {
    redirect("/admin/orders?error=1");
  }
  redirect("/admin/orders?saved=1");
}

/**
 * Full lifecycle status update with transition validation, audit trail and
 * customer notification. Used by the enhanced admin order management UI.
 *
 * On success the caller is redirected back to the admin orders page with a
 * `saved=1` query param. On an invalid transition or server error the caller
 * is redirected back with an `error` message instead.
 */
export async function updateOrderLifecycleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let orderId: string | null = null;
  try {
    const access = await requireAdminAccess();
    const catalog = getCatalog();

    orderId = optionalString(formData.get("orderId"));
    if (!orderId) {
      return { status: "error", message: "Missing order ID." };
    }

    const order = await catalog.getOrderById(orderId);
    if (!order) {
      return { status: "error", message: "Order not found." };
    }

    const deliveryStage = optionalString(formData.get("deliveryStage")) || undefined;
    const courierPartner = optionalString(formData.get("courierPartner")) || undefined;
    const trackingId = optionalString(formData.get("trackingId")) || undefined;

    await catalog.updateOrderLifecycle({
      orderId: order.id,
      deliveryStage,
      courierPartner,
      trackingId,
      updatedBy: access.identity?.userId ?? "local-admin",
    });

    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
    revalidatePath("/order/[id]");

    return { status: "success", message: "Order tracking updated." };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not update the order status.",
    };
  }
}

/**
 * Server action to update stock for a product variant (size).
 * Called from the admin inventory management page.
 */
export async function updateVariantStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAccess();
    const catalog = getCatalog();

    const productId = optionalString(formData.get("productId"));
    if (!productId) {
      return { status: "error", message: "Missing product ID." };
    }

    // Collect all variant stock updates from the form. A blank value means the
    // colour/size is made to order and is not inventory-tracked.
    const updates: { variantId: string; stockQuantity: number | null }[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("variant_") && typeof value === "string") {
        const variantId = key.replace("variant_", "");
        if (!variantId) continue;
        if (value.trim() === "") {
          updates.push({ variantId, stockQuantity: null });
          continue;
        }
        const stockQuantity = Number(value);
        if (Number.isInteger(stockQuantity) && stockQuantity >= 0) {
          updates.push({ variantId, stockQuantity });
        }
      }
    }

    if (updates.length === 0) {
      return { status: "error", message: "No stock changes to save." };
    }

    // Apply each update sequentially
    for (const update of updates) {
      await catalog.updateVariantStock(update.variantId, update.stockQuantity);
    }

    revalidateInventory(productId);

    return { status: "success", message: "Stock updated." };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not update stock.",
    };
  }
}

export async function addProductVariantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAccess();
    const catalog = getCatalog();

    const productId = optionalString(formData.get("productId"));
    if (!productId) {
      return { status: "error", message: "Missing product ID." };
    }

    const product = await catalog.getProductById(productId);
    if (!product) {
      return { status: "error", message: "Product not found." };
    }

    const size = optionalString(formData.get("size"));
    if (!size) {
      return {
        status: "error",
        message: "Enter a size.",
        fieldErrors: { size: "Size is required." },
      };
    }
    if (size.length > 50) {
      return {
        status: "error",
        message: "Size must be 50 characters or fewer.",
        fieldErrors: { size: "Size must be 50 characters or fewer." },
      };
    }

    const stockValue = optionalString(formData.get("stock"));
    const stockQuantity = stockValue === null ? 0 : Number(stockValue);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return {
        status: "error",
        message: "Stock must be a non-negative whole number.",
        fieldErrors: { stock: "Enter a whole number of 0 or more." },
      };
    }

    const variantSku = optionalString(formData.get("sku"));
    const colour = optionalString(formData.get("colour"));
    const colourHex = optionalString(formData.get("colour_hex"));

    const existing = await catalog.getProductVariants(productId);
    const duplicate = existing.some(
      (variant) =>
        variant.variant_value.trim().toLowerCase() === size.toLowerCase() &&
        (variant.colour ?? "").trim().toLowerCase() === (colour ?? "").toLowerCase(),
    );
    if (duplicate) {
      return {
        status: "error",
        message: `${colour ? `${colour} — ` : ""}size ${size} already exists for this product. Update its stock below.`,
        fieldErrors: { size: "This size already exists." },
      };
    }

    await catalog.createVariant(productId, {
      variant_name: "Size",
      variant_value: size,
      size,
      colour,
      colour_hex: colourHex,
      sku: variantSku,
      stock_quantity: stockQuantity,
      price_override: null,
      is_active: true,
    });

    revalidateInventory(productId);

    return { status: "success", message: `Size ${size} added with stock ${stockQuantity}.` };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    const message =
      error instanceof Error ? error.message : "Could not add the size.";
    if (/duplicate|unique/i.test(message)) {
      return {
        status: "error",
        message: "That size already exists for this product.",
        fieldErrors: { size: "This size already exists." },
      };
    }
    return { status: "error", message };
  }
}

export async function addProductVariantsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAccess();
    const catalog = getCatalog();

    const productId = optionalString(formData.get("productId"));
    if (!productId) {
      return { status: "error", message: "Missing product ID." };
    }

    const product = await catalog.getProductById(productId);
    if (!product) {
      return { status: "error", message: "Product not found." };
    }

    const existing = await catalog.getProductVariants(productId);
    const lockedColour =
      product.colours?.[0]?.trim() ||
      existing.find((variant) => variant.colour)?.colour?.trim() ||
      null;

    const sizes = formData.getAll("size");
    const stocks = formData.getAll("stock");
    const skus = formData.getAll("sku");
    const colours = formData.getAll("colour");
    const colourHexes = formData.getAll("colour_hex");

    if (sizes.length === 0) {
      return { status: "error", message: "Add at least one size." };
    }

    const fieldErrors: Record<string, string> = {};
    const seen = new Set<string>();
    const rows: {
      size: string;
      colour: string | null;
      colourHex: string | null;
      stockQuantity: number;
      sku: string | null;
    }[] = [];

    for (let index = 0; index < sizes.length; index += 1) {
      const size = String(sizes[index] ?? "").trim();
      const colour =
        lockedColour ?? (String(colours[index] ?? "").trim() || null);
      if (!size) {
        fieldErrors[`size_${index}`] = "Size is required.";
        continue;
      }
      if (size.length > 50) {
        fieldErrors[`size_${index}`] = "Size must be 50 characters or fewer.";
        continue;
      }

      const key = `${(colour ?? "").toLowerCase()}::${size.toLowerCase()}`;
      if (seen.has(key)) {
        fieldErrors[`size_${index}`] = "This colour/size is listed more than once.";
        continue;
      }
      seen.add(key);

      const stockRaw = String(stocks[index] ?? "").trim();
      const stockQuantity = stockRaw === "" ? 0 : Number(stockRaw);
      if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
        fieldErrors[`stock_${index}`] = "Enter a whole number of 0 or more.";
        continue;
      }

      const skuRaw = String(skus[index] ?? "").trim();
      const colourHexRaw = String(colourHexes[index] ?? "").trim();
      rows.push({
        size,
        colour,
        colourHex: colourHexRaw.length ? colourHexRaw : null,
        stockQuantity,
        sku: skuRaw.length ? skuRaw : null,
      });
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: "error",
        message: "Please correct the highlighted sizes.",
        fieldErrors,
      };
    }

    const existingKeys = new Set(
      existing.map(
        (variant) =>
          `${(variant.colour ?? "").trim().toLowerCase()}::${variant.variant_value
            .trim()
            .toLowerCase()}`,
      ),
    );
    const duplicates = rows
      .filter((row) =>
        existingKeys.has(`${(row.colour ?? "").toLowerCase()}::${row.size.toLowerCase()}`),
      )
      .map((row) => (row.colour ? `${row.colour} ${row.size}` : row.size));

    if (duplicates.length > 0) {
      return {
        status: "error",
        message: `${duplicates.join(", ")} already ${
          duplicates.length === 1 ? "exists" : "exist"
        } for this product. Update the existing stock instead.`,
      };
    }

    for (const row of rows) {
      await catalog.createVariant(productId, {
        variant_name: "Size",
        variant_value: row.size,
        size: row.size,
        colour: row.colour,
        colour_hex: row.colourHex,
        sku: row.sku,
        stock_quantity: row.stockQuantity,
        price_override: null,
        is_active: true,
      });
    }

    revalidateInventory(productId);

    return {
      status: "success",
      message: `Added ${rows.length} size${rows.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return { status: "error", message: error.message };
    }
    const message =
      error instanceof Error ? error.message : "Could not add the sizes.";
    if (/duplicate|unique/i.test(message)) {
      return {
        status: "error",
        message: "One of these sizes already exists for this product.",
      };
    }
    return { status: "error", message };
  }
}

export async function deleteProductVariantAction(formData: FormData): Promise<void> {
  await requireAdminAccess();
  const catalog = getCatalog();
  const productId = optionalString(formData.get("productId"));
  const variantId = optionalString(formData.get("variantId"));

  if (!productId || !variantId) {
    redirect("/admin/inventory");
  }

  const product = await catalog.getProductById(productId);
  const belongsToProduct = product?.variants?.some(
    (variant) => variant.id === variantId,
  );
  if (!belongsToProduct) {
    redirect(`/admin/inventory/${productId}?error=1`);
  }

  await catalog.deleteVariant(variantId);
  revalidateInventory(productId);
  redirect(`/admin/inventory/${productId}?deleted=1`);
}
