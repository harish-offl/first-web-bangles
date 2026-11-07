// Splits every multi-colour Glass Bangles product into one independent product
// per colour, in the live Supabase database.
//
// Usage:
//   node scripts/apply-glass-bangles-split.mjs            # dry run (default)
//   node scripts/apply-glass-bangles-split.mjs --apply    # write to Supabase
//
// The migration is idempotent and non-destructive:
//   * Existing colour products are reused (matched by slug), never duplicated.
//   * Existing variant rows are moved to their colour product, preserving ids,
//     stock, prices and SKUs so order history and stock are not reset.
//   * The legacy multi-colour product is only deactivated after every colour
//     has been created and its variants moved. It is never deleted.
//   * A JSON backup of the affected product, variants and palette is written to
//     .data/ before any write.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GLASS_CATEGORY_SLUG = "glass-bangles";
const BANGLE_SIZES = ["2.2", "2.4", "2.6", "2.8", "2.10"];

const COLOUR_CODE = {
  "forest green": "FG",
  "pista green": "PG",
  pista: "PS",
  pink: "PK",
  maroon: "MR",
  red: "RD",
  "rust orange": "RO",
  orange: "OR",
};

const COLOUR_ALIASES = {
  pista: "Pista Green",
  "pista green": "Pista Green",
};

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

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function colourCode(colour) {
  const key = colour.trim().toLowerCase();
  if (COLOUR_CODE[key]) return COLOUR_CODE[key];
  const words = key.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join("").toUpperCase();
  return key.slice(0, 2).toUpperCase();
}

function canonicalColour(value, palette) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const paletteMatch = palette.find(
    (row) => row.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (paletteMatch) return paletteMatch.name;
  return COLOUR_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

function unwrap(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

function localColourImage(colour) {
  const relative = `/images/products/colors/bng-159-${slugify(colour)}.jpg`;
  const absolute = path.join(ROOT, "public", relative.replace(/^\//, ""));
  return fs.existsSync(absolute) ? relative : null;
}

function resolveImage(colour, paletteRow, colourImages, fallback) {
  return (
    localColourImage(colour) ??
    paletteRow?.image_url ??
    colourImages.get(colour.trim().toLowerCase()) ??
    fallback ??
    null
  );
}

function distinctColours(product, variants, palette) {
  const names = new Set();
  for (const colour of product.colours ?? []) {
    const canonical = canonicalColour(colour, palette);
    if (canonical) names.add(canonical);
  }
  for (const variant of variants) {
    const canonical = canonicalColour(variant.colour, palette);
    if (canonical) names.add(canonical);
  }
  return [...names];
}

function paletteIndex(palette, colour) {
  const index = palette.findIndex(
    (row) => row.name.trim().toLowerCase() === colour.trim().toLowerCase(),
  );
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function nowIso() {
  return new Date().toISOString();
}

function loadPreferredIds() {
  const catalogPath = path.join(ROOT, "src", "lib", "data", "catalog.json");
  if (!fs.existsSync(catalogPath)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const map = new Map();
  for (const product of catalog.products ?? []) {
    if (product.slug && product.id) map.set(product.slug, product.id);
  }
  return map;
}

async function fetchState(supabase) {
  const preferredIds = loadPreferredIds();
  const category = unwrap(
    await supabase.from("categories").select("*").eq("slug", GLASS_CATEGORY_SLUG).maybeSingle(),
    "load glass-bangles category",
  );
  if (!category) throw new Error("Glass Bangles category was not found.");

  const palette = unwrap(
    await supabase
      .from("product_colours")
      .select("*")
      .eq("category_id", category.id)
      .order("sort_order", { ascending: true }),
    "load product_colours",
  );

  const allProducts = unwrap(
    await supabase.from("products").select("*").order("sort_index", { ascending: true }),
    "load products",
  );

  const glassProducts = allProducts.filter(
    (product) => product.category_id === category.id,
  );
  const productIds = glassProducts.map((product) => product.id);

  const variants = productIds.length
    ? unwrap(
        await supabase
          .from("product_variants")
          .select("*")
          .in("product_id", productIds),
        "load product_variants",
      )
    : [];

  const variantsByProduct = new Map();
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  return { category, palette, allProducts, glassProducts, variantsByProduct, preferredIds };
}

function buildPlan(state) {
  const { palette, allProducts, glassProducts, variantsByProduct, preferredIds } = state;
  const bySlug = new Map(allProducts.map((product) => [product.slug, product]));
  const usedIds = new Set(allProducts.map((product) => product.id));
  const plan = [];

  for (const product of glassProducts) {
    const variants = variantsByProduct.get(product.id) ?? [];
    // A legacy product that was already split is inactive with no variants.
    // Keep a partially-migrated product in scope so it can be finished safely.
    if (!product.is_active && variants.length === 0) continue;
    const colours = distinctColours(product, variants, palette).sort(
      (a, b) => paletteIndex(palette, a) - paletteIndex(palette, b),
    );
    if (colours.length <= 1) continue;

    const colourImages = new Map(
      (product.colour_images ?? []).map((image) => [
        String(image.colour ?? "").trim().toLowerCase(),
        image.image_url,
      ]),
    );

    plan.push({
      product,
      variants,
      colours: colours.map((colour, index) => {
        const paletteRow = palette.find(
          (row) => row.name.trim().toLowerCase() === colour.trim().toLowerCase(),
        );
        const slug = `${product.slug}-${slugify(colour)}`;
        const existing = bySlug.get(slug) ?? null;
        const preferredId = preferredIds.get(slug);
        const id =
          existing?.id ??
          (preferredId && !usedIds.has(preferredId) ? preferredId : randomUUID());
        if (!existing) usedIds.add(id);
        return {
          colour,
          slug,
          id,
          name: `${product.name} \u2013 ${colour}`,
          sku: product.sku ? `${product.sku}-${colourCode(colour)}` : null,
          image: resolveImage(colour, paletteRow, colourImages, product.primary_image_url),
          paletteRow,
          sortIndex: (product.sort_index ?? 0) + index,
          existing,
          sourceVariants: variants.filter(
            (variant) =>
              canonicalColour(variant.colour, palette).toLowerCase() === colour.toLowerCase(),
          ),
        };
      }),
    });
  }

  return plan;
}

function printPlan(plan) {
  if (plan.length === 0) {
    console.log("No multi-colour Glass Bangles products found. Nothing to split.");
    return;
  }

  for (const entry of plan) {
    console.log(`\nLegacy product: ${entry.product.name} (${entry.product.id})`);
    console.log(`  variants: ${entry.variants.length}`);
    for (const colour of entry.colours) {
      console.log(
        `  - ${colour.colour} -> ${colour.slug} (${colour.id})` +
          `${colour.existing ? " [reuse existing]" : " [create]"}` +
          ` | variants: ${colour.sourceVariants.length}` +
          ` | image: ${colour.image ?? "none"}`,
      );
    }
  }
}

function backup(state, plan) {
  const dir = path.join(ROOT, ".data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `glass-bangles-split-backup-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: nowIso(),
        category: state.category,
        palette: state.palette,
        products: plan.map((entry) => ({
          product: entry.product,
          variants: entry.variants,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup written to ${file}`);
}

async function applyPlan(supabase, state, plan) {
  const { category } = state;
  let createdProducts = 0;
  let reusedProducts = 0;
  let movedVariants = 0;
  let archivedVariants = 0;
  let createdVariants = 0;

  const report = [];

  for (const entry of plan) {
    const createdForProduct = [];

    for (const colour of entry.colours) {
      let target = colour.existing;

      if (!target) {
        const insert = {
          id: colour.id,
          category_id: category.id,
          name: colour.name,
          slug: colour.slug,
          description: entry.product.description ?? "",
          sku: colour.sku,
          price: entry.product.price ?? 0,
          compare_at_price: entry.product.compare_at_price ?? null,
          stock_quantity: null,
          primary_image_url: colour.image,
          colours: [colour.colour],
          colour_images: colour.image
            ? [{ colour: colour.colour, image_url: colour.image }]
            : [],
          is_active: true,
          is_featured: entry.product.is_featured ?? false,
          is_new_arrival: entry.product.is_new_arrival ?? false,
          seo_title: entry.product.seo_title ?? null,
          seo_description: entry.product.seo_description ?? null,
          legacy_id: entry.product.legacy_id ?? null,
          legacy_image_source: entry.product.legacy_image_source ?? null,
          sort_index: colour.sortIndex,
        };
        target = unwrap(
          await supabase.from("products").insert(insert).select("*").single(),
          `insert product ${colour.slug}`,
        );
        createdProducts += 1;
      } else {
        const update = {
          category_id: category.id,
          colours: [colour.colour],
          colour_images: colour.image
            ? [{ colour: colour.colour, image_url: colour.image }]
            : [],
          primary_image_url: target.primary_image_url || colour.image,
          is_active: true,
          updated_at: nowIso(),
        };
        target = unwrap(
          await supabase.from("products").update(update).eq("id", target.id).select("*").single(),
          `update product ${colour.slug}`,
        );
        reusedProducts += 1;
      }

      unwrap(
        await supabase.from("category_products").upsert(
          {
            category_id: category.id,
            product_id: target.id,
            sort_order: colour.sortIndex,
          },
          { onConflict: "category_id,product_id" },
        ),
        `assign ${colour.slug} to Glass Bangles`,
      );

      if (colour.paletteRow && colour.image && colour.paletteRow.image_url !== colour.image) {
        unwrap(
          await supabase
            .from("product_colours")
            .update({ image_url: colour.image, updated_at: nowIso() })
            .eq("id", colour.paletteRow.id),
          `update palette image for ${colour.colour}`,
        );
      }

      const targetVariants = unwrap(
        await supabase.from("product_variants").select("*").eq("product_id", target.id),
        `load variants for ${colour.slug}`,
      );

      for (const source of colour.sourceVariants) {
        const size = String(source.size ?? source.variant_value ?? "").trim();
        const match = targetVariants.find(
          (variant) =>
            String(variant.size ?? variant.variant_value ?? "").trim().toLowerCase() ===
            size.toLowerCase(),
        );

        if (match) {
          const patch = {
            stock_quantity:
              match.stock_quantity === null ? source.stock_quantity : match.stock_quantity,
            price_override:
              match.price_override === null ? source.price_override : match.price_override,
            sku: match.sku ?? source.sku,
            updated_at: nowIso(),
          };
          unwrap(
            await supabase.from("product_variants").update(patch).eq("id", match.id),
            `merge variant ${match.id}`,
          );
          unwrap(
            await supabase
              .from("product_variants")
              .update({ is_active: false, updated_at: nowIso() })
              .eq("id", source.id),
            `archive duplicate variant ${source.id}`,
          );
          archivedVariants += 1;
          continue;
        }

        unwrap(
          await supabase
            .from("product_variants")
            .update({
              product_id: target.id,
              colour: colour.colour,
              colour_hex: colour.paletteRow?.hex_code ?? source.colour_hex ?? null,
              size: size || source.variant_value,
              image_url: colour.image ?? source.image_url,
              is_active: true,
              updated_at: nowIso(),
            })
            .eq("id", source.id),
          `move variant ${source.id} to ${colour.slug}`,
        );
        targetVariants.push({ ...source, size, product_id: target.id });
        movedVariants += 1;
      }

      for (const size of BANGLE_SIZES) {
        if (
          targetVariants.some(
            (variant) =>
              String(variant.size ?? variant.variant_value ?? "").trim().toLowerCase() ===
              size.toLowerCase(),
          )
        ) {
          continue;
        }
        unwrap(
          await supabase.from("product_variants").insert({
            product_id: target.id,
            variant_name: "Size",
            variant_value: size,
            size,
            colour: colour.colour,
            colour_hex: colour.paletteRow?.hex_code ?? null,
            image_url: colour.image,
            stock_quantity: null,
            price_override: null,
            is_active: true,
          }),
          `create missing size ${size} for ${colour.slug}`,
        );
        createdVariants += 1;
      }

      createdForProduct.push({
        colour: colour.colour,
        slug: colour.slug,
        productId: target.id,
        reused: Boolean(colour.existing),
      });
    }

    unwrap(
      await supabase
        .from("products")
        .update({ is_active: false, updated_at: nowIso() })
        .eq("id", entry.product.id),
      "deactivate legacy multi-colour product",
    );

    unwrap(
      await supabase
        .from("category_products")
        .delete()
        .eq("category_id", category.id)
        .eq("product_id", entry.product.id),
      "remove legacy category assignment",
    );

    report.push({
      legacyProduct: { id: entry.product.id, name: entry.product.name },
      colours: createdForProduct,
    });
  }

  return {
    report,
    createdProducts,
    reusedProducts,
    movedVariants,
    archivedVariants,
    createdVariants,
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

  const state = await fetchState(supabase);
  const plan = buildPlan(state);
  printPlan(plan);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write these changes.");
    return;
  }

  if (plan.length === 0) return;
  backup(state, plan);

  const result = await applyPlan(supabase, state, plan);

  console.log("\n=== Migration complete ===");
  for (const entry of result.report) {
    console.log(`Legacy: ${entry.legacyProduct.name} (${entry.legacyProduct.id})`);
    for (const colour of entry.colours) {
      console.log(
        `  ${colour.colour}: ${colour.productId} (${colour.reused ? "reused" : "created"})`,
      );
    }
  }
  console.log(`Products created: ${result.createdProducts}`);
  console.log(`Products reused: ${result.reusedProducts}`);
  console.log(`Variants moved: ${result.movedVariants}`);
  console.log(`Duplicate variants archived: ${result.archivedVariants}`);
  console.log(`Missing size rows created: ${result.createdVariants}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
