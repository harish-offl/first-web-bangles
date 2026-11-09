// Restructures the Glass Bangles category in the live Supabase database into
// exactly two multi-colour products:
//
//   1. Raindrop Glass Bangles            (7 colours x 5 sizes)
//   2. Nalini Designer Glass Bangles     (5 colours x 5 sizes)
//
// The target structure is read from `src/lib/data/catalog.json`, which is the
// same fixture the local development server uses, so production and local stay
// in sync.
//
// Usage:
//   node scripts/apply-raindrop-nalini-restructure.mjs            # dry run
//   node scripts/apply-raindrop-nalini-restructure.mjs --apply    # write
//
// Safety:
//   * A full JSON backup of the affected rows is written to `.data/` first.
//   * Existing per-colour Raindrop variants are moved (ids, stock, prices and
//     SKUs preserved) onto the parent product, never deleted.
//   * The seven per-colour products are only deactivated, never deleted.
//   * Re-running the script is a no-op once the target state is reached.
//   * Nothing outside the Glass Bangles category is touched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORY_SLUG = "glass-bangles";
const TARGET_SLUGS = ["raindrop-glass-bangles", "nalini-designer-glass-bangles"];
const BANGLE_SIZES = ["2.2", "2.4", "2.6", "2.8", "2.10"];

// Canonical palette (mirrors src/lib/glass-colours.ts).
const PALETTE = [
  { name: "Forest Green", hex: "#2F5D3A" },
  { name: "Pista Green", hex: "#A3C585" },
  { name: "Pink", hex: "#EAB8C8" },
  { name: "Maroon", hex: "#6D1F2C" },
  { name: "Red", hex: "#C62828" },
  { name: "Rust Orange", hex: "#B85C2E" },
  { name: "Orange", hex: "#F28C28" },
  { name: "Peacock Blue", hex: "#006994" },
  { name: "Mustard Yellow", hex: "#E4C441" },
  { name: "Royal Blue", hex: "#4169E1" },
];

function loadEnv() {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function unwrap(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function nowIso() {
  return new Date().toISOString();
}

function keyOf(colour, size) {
  return `${String(colour ?? "").trim().toLowerCase()}|${String(size ?? "").trim().toLowerCase()}`;
}

function hexFor(colour) {
  return PALETTE.find((entry) => entry.name.toLowerCase() === colour.toLowerCase())?.hex ?? null;
}

function loadTargets() {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "lib", "data", "catalog.json"), "utf8"),
  );
  return TARGET_SLUGS.map((slug) => {
    const product = (catalog.products ?? []).find((row) => row.slug === slug);
    if (!product) throw new Error(`catalog.json is missing ${slug}`);
    return product;
  });
}

function productFields(categoryId, product) {
  return {
    category_id: categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    sku: product.sku,
    price: product.price,
    compare_at_price: product.compare_at_price ?? null,
    stock_quantity: product.stock_quantity ?? null,
    primary_image_url: product.primary_image_url,
    colours: product.colours,
    colour_images: product.colour_images,
    is_active: true,
    is_featured: product.is_featured ?? false,
    is_new_arrival: product.is_new_arrival ?? false,
    seo_title: product.seo_title ?? null,
    seo_description: product.seo_description ?? null,
    legacy_id: product.legacy_id ?? null,
    legacy_image_source: product.legacy_image_source ?? null,
    sort_index: product.sort_index,
    updated_at: nowIso(),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const targets = loadTargets();
  const category = unwrap(
    await supabase.from("categories").select("*").eq("slug", CATEGORY_SLUG).maybeSingle(),
    "load glass-bangles category",
  );
  if (!category) throw new Error("Glass Bangles category was not found.");

  const allGlass = unwrap(
    await supabase.from("products").select("*").eq("category_id", category.id),
    "load glass products",
  );
  const bySlug = new Map(allGlass.map((product) => [product.slug, product]));
  const allGlassIds = allGlass.map((product) => product.id);

  const existingVariants = allGlassIds.length
    ? unwrap(
        await supabase
          .from("product_variants")
          .select("*")
          .in("product_id", allGlassIds),
        "load glass variants",
      )
    : [];
  const existingPalette = unwrap(
    await supabase
      .from("product_colours")
      .select("*")
      .eq("category_id", category.id)
      .order("sort_order", { ascending: true }),
    "load glass palette",
  );
  const existingAssignments = unwrap(
    await supabase.from("category_products").select("*").eq("category_id", category.id),
    "load category assignments",
  );

  // Colour image lookup.
  //
  // The palette is category-level, so a shared colour name (Pista Green,
  // Orange) must resolve to one photo. Prefer the first target that defines
  // the colour (Raindrop), which keeps the existing local swatch photos.
  // Variant images are resolved per product so a Raindrop variant never points
  // at a Nalini photo.
  const paletteImages = new Map();
  const colourImagesBySlug = new Map();
  for (const product of targets) {
    const own = new Map();
    for (const image of product.colour_images ?? []) {
      const colourKey = image.colour.trim().toLowerCase();
      own.set(colourKey, image.image_url);
      if (!paletteImages.has(colourKey)) paletteImages.set(colourKey, image.image_url);
    }
    colourImagesBySlug.set(product.slug, own);
  }

  const sourceProducts = allGlass.filter(
    (product) =>
      product.slug !== "raindrop-glass-bangles" &&
      product.slug.startsWith("raindrop-glass-bangles-"),
  );

  console.log(`Category: ${category.name} (${category.id})`);
  console.log(`Glass products currently: ${allGlass.length}`);
  console.log(`Per-colour Raindrop products to retire: ${sourceProducts.length}`);
  for (const product of targets) {
    const existing = bySlug.get(product.slug);
    console.log(
      `Target: ${product.name} (${product.slug}) -> ` +
        `${existing ? `update ${existing.id} active=${existing.is_active}` : `create ${product.id}`} | ` +
        `${product.colours.length} colours x ${BANGLE_SIZES.length} sizes`,
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write these changes.");
    return;
  }

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------
  const backupDir = path.join(ROOT, ".data");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `raindrop-nalini-restructure-backup-${Date.now()}.json`,
  );
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        generatedAt: nowIso(),
        category,
        palette: existingPalette,
        assignments: existingAssignments,
        products: allGlass,
        variants: existingVariants,
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup written to ${backupFile}`);

  // -------------------------------------------------------------------------
  // 1. Palette
  // -------------------------------------------------------------------------
  const paletteByName = new Map(
    existingPalette.map((row) => [row.name.trim().toLowerCase(), row]),
  );
  for (const [index, colour] of PALETTE.entries()) {
    const image =
      paletteImages.get(colour.name.toLowerCase()) ??
      paletteByName.get(colour.name.toLowerCase())?.image_url ??
      null;
    const match = paletteByName.get(colour.name.toLowerCase());
    if (match) {
      unwrap(
        await supabase
          .from("product_colours")
          .update({
            name: colour.name,
            hex_code: colour.hex,
            image_url: image,
            sort_order: index,
            is_active: true,
            updated_at: nowIso(),
          })
          .eq("id", match.id),
        `update palette ${colour.name}`,
      );
    } else {
      unwrap(
        await supabase.from("product_colours").insert({
          category_id: category.id,
          name: colour.name,
          hex_code: colour.hex,
          image_url: image,
          sort_order: index,
          is_active: true,
        }),
        `insert palette ${colour.name}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. Products
  // -------------------------------------------------------------------------
  const resolved = new Map();
  for (const product of targets) {
    const fields = productFields(category.id, product);
    const existing = bySlug.get(product.slug);
    if (existing) {
      const row = unwrap(
        await supabase
          .from("products")
          .update(fields)
          .eq("id", existing.id)
          .select("*")
          .single(),
        `update product ${product.slug}`,
      );
      resolved.set(product.slug, row);
    } else {
      const row = unwrap(
        await supabase
          .from("products")
          .insert({ id: product.id, ...fields })
          .select("*")
          .single(),
        `insert product ${product.slug}`,
      );
      resolved.set(product.slug, row);
    }
  }

  const raindrop = resolved.get("raindrop-glass-bangles");
  const nalini = resolved.get("nalini-designer-glass-bangles");

  // -------------------------------------------------------------------------
  // 3. Move per-colour Raindrop variants onto the parent product
  // -------------------------------------------------------------------------
  const sourceIds = new Set(sourceProducts.map((product) => product.id));
  const sourceVariants = existingVariants.filter((variant) =>
    sourceIds.has(variant.product_id),
  );
  const raindropVariants = existingVariants.filter(
    (variant) => variant.product_id === raindrop.id,
  );
  const raindropKeys = new Map(
    raindropVariants.map((variant) => [
      keyOf(variant.colour, variant.size ?? variant.variant_value),
      variant,
    ]),
  );

  let moved = 0;
  let archived = 0;
  for (const variant of sourceVariants) {
    const source = sourceProducts.find((product) => product.id === variant.product_id);
    const colour = String(variant.colour ?? source?.colours?.[0] ?? "").trim();
    const size = String(variant.size ?? variant.variant_value ?? "").trim();
    if (!colour || !size) continue;

    const target = raindropKeys.get(keyOf(colour, size));
    if (target && target.is_active !== false) {
      // A live duplicate already exists on the parent; retire the source copy.
      unwrap(
        await supabase
          .from("product_variants")
          .update({ is_active: false, updated_at: nowIso() })
          .eq("id", variant.id),
        `archive duplicate variant ${variant.id}`,
      );
      archived += 1;
      continue;
    }

    const row = unwrap(
      await supabase
        .from("product_variants")
        .update({
          product_id: raindrop.id,
          variant_name: "Size",
          variant_value: size,
          size,
          colour,
          colour_hex: hexFor(colour),
          image_url:
            colourImagesBySlug.get(raindrop.slug)?.get(colour.toLowerCase()) ??
            variant.image_url ??
            null,
          is_active: true,
          updated_at: nowIso(),
        })
        .eq("id", variant.id)
        .select("*")
        .single(),
      `move variant ${variant.id} to ${raindrop.slug}`,
    );
    raindropKeys.set(keyOf(colour, size), row);
    moved += 1;
  }

  // -------------------------------------------------------------------------
  // 4. Ensure the full colour x size matrix for both products
  // -------------------------------------------------------------------------
  async function ensureMatrix(product) {
    const rows = unwrap(
      await supabase.from("product_variants").select("*").eq("product_id", product.id),
      `load variants for ${product.slug}`,
    );
    const byKey = new Map(
      rows.map((variant) => [
        keyOf(variant.colour, variant.size ?? variant.variant_value),
        variant,
      ]),
    );

    const ownImages = colourImagesBySlug.get(product.slug) ?? new Map();
    let created = 0;
    let updated = 0;
    for (const colour of product.colours) {
      const image =
        ownImages.get(colour.toLowerCase()) ??
        paletteImages.get(colour.toLowerCase()) ??
        null;
      const hex = hexFor(colour);
      for (const size of BANGLE_SIZES) {
        const existing = byKey.get(keyOf(colour, size));
        if (!existing) {
          const row = unwrap(
            await supabase
              .from("product_variants")
              .insert({
                product_id: product.id,
                variant_name: "Size",
                variant_value: size,
                size,
                colour,
                colour_hex: hex,
                image_url: image,
                sku: null,
                price_override: null,
                stock_quantity: null,
                is_active: true,
              })
              .select("*")
              .single(),
            `create ${colour}/${size} for ${product.slug}`,
          );
          byKey.set(keyOf(colour, size), row);
          created += 1;
          continue;
        }

        const patch = {};
        if (existing.variant_name !== "Size") patch.variant_name = "Size";
        if (existing.variant_value !== size) patch.variant_value = size;
        if (existing.size !== size) patch.size = size;
        if (existing.colour !== colour) patch.colour = colour;
        if (existing.colour_hex !== hex) patch.colour_hex = hex;
        if (image && existing.image_url !== image) patch.image_url = image;
        if (existing.is_active === false) patch.is_active = true;
        if (Object.keys(patch).length) {
          patch.updated_at = nowIso();
          unwrap(
            await supabase
              .from("product_variants")
              .update(patch)
              .eq("id", existing.id),
            `update ${colour}/${size} for ${product.slug}`,
          );
          updated += 1;
        }
      }
    }
    return { created, updated };
  }

  const raindropMatrix = await ensureMatrix(raindrop);
  const naliniMatrix = await ensureMatrix(nalini);

  // -------------------------------------------------------------------------
  // 5. Category assignments: exactly the two products
  // -------------------------------------------------------------------------
  unwrap(
    await supabase.from("category_products").delete().eq("category_id", category.id),
    "clear glass category assignments",
  );
  unwrap(
    await supabase.from("category_products").insert([
      { category_id: category.id, product_id: raindrop.id, sort_order: 0 },
      { category_id: category.id, product_id: nalini.id, sort_order: 1 },
    ]),
    "assign Raindrop and Nalini to Glass Bangles",
  );

  // -------------------------------------------------------------------------
  // 6. Retire the seven per-colour products (data preserved)
  // -------------------------------------------------------------------------
  for (const product of sourceProducts) {
    unwrap(
      await supabase
        .from("products")
        .update({ is_active: false, updated_at: nowIso() })
        .eq("id", product.id),
      `deactivate ${product.slug}`,
    );
  }

  console.log("\n=== Migration complete ===");
  console.log(`Raindrop product: ${raindrop.id}`);
  console.log(`Nalini product:   ${nalini.id}`);
  console.log(`Variants moved:   ${moved}`);
  console.log(`Duplicates archived: ${archived}`);
  console.log(
    `Raindrop matrix:  ${raindropMatrix.created} created, ${raindropMatrix.updated} updated`,
  );
  console.log(
    `Nalini matrix:    ${naliniMatrix.created} created, ${naliniMatrix.updated} updated`,
  );
  console.log(`Per-colour products deactivated: ${sourceProducts.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
