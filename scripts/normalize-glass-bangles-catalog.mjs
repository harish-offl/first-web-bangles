// Normalizes the local catalog so Glass Bangles has exactly one independent
// product per colour, with no duplicate colours and correct images.
//
// Usage: node scripts/normalize-glass-bangles-catalog.mjs
//
// This is idempotent and only touches Glass Bangles entries.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "src", "lib", "data", "catalog.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const GLASS_CATEGORY_ID = "21c45a58-1868-5636-a6ca-f233f61f95b8";
const LEGACY_ID = "ec3ce521-740c-5e32-819e-b893ebbbdf17";
const BASE_SLUG = "raindrop-glass-bangles";
const BASE_NAME = "Raindrop Glass bangles";
const BASE_SKU = "BNG-159";
const BANGLE_SIZES = ["2.2", "2.4", "2.6", "2.8", "2.10"];
const DESCRIPTION =
  "Raindrop glass bangles available in seven colourways \u2014 forest green, pista green, pink, maroon, red, rust orange and orange \u2014 each finished with delicate raindrop detailing. Stack a few for a subtle look or wear the full set for poojas and family gatherings.";

const COLOURS = [
  { name: "Forest Green", code: "FG" },
  { name: "Pista Green", code: "PG" },
  { name: "Pink", code: "PK" },
  { name: "Maroon", code: "MR" },
  { name: "Red", code: "RD" },
  { name: "Rust Orange", code: "RO" },
  { name: "Orange", code: "OR" },
];

const ALIASES = new Map([
  ["pista", "Pista Green"],
  ["pista green", "Pista Green"],
]);

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalColour(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const known = COLOURS.find((colour) => colour.name.toLowerCase() === trimmed.toLowerCase());
  return known?.name ?? ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

function imageFor(colour) {
  const relative = `/images/products/colors/${BASE_SKU.toLowerCase()}-${slugify(colour)}.jpg`;
  return fs.existsSync(path.join(PUBLIC_DIR, relative.replace(/^\//, ""))) ? relative : null;
}

function colourCode(colour) {
  return COLOURS.find((entry) => entry.name === colour)?.code ?? colour.slice(0, 2).toUpperCase();
}

function normalizeProduct(product, index) {
  const colour = canonicalColour(product.colours?.[0] ?? product.variants?.[0]?.colour);
  const image = imageFor(colour);
  if (!colour || !image) {
    throw new Error(`Cannot normalize ${product.slug}: colour=${colour || "missing"} image=${image}`);
  }

  const existingBySize = new Map();
  for (const variant of product.variants ?? []) {
    const size = String(variant.size ?? variant.variant_value ?? "").trim();
    if (size) existingBySize.set(size, variant);
  }

  const variants = BANGLE_SIZES.map((size) => {
    const existing = existingBySize.get(size);
    return {
      ...(existing ?? {}),
      id: existing?.id ?? randomUUID(),
      product_id: product.id,
      variant_name: "Size",
      variant_value: size,
      size,
      colour,
      colour_hex: existing?.colour_hex ?? null,
      image_url: image,
      sku: existing?.sku ?? null,
      stock_quantity: existing?.stock_quantity ?? null,
      price_override: existing?.price_override ?? null,
      is_active: true,
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const now = new Date().toISOString();
  return {
    ...product,
    name: `${BASE_NAME} \u2013 ${colour}`,
    slug: `${BASE_SLUG}-${slugify(colour)}`,
    description: DESCRIPTION,
    sku: `${BASE_SKU}-${colourCode(colour)}`,
    primary_image_url: image,
    colours: [colour],
    colour_images: [{ colour, image_url: image }],
    is_active: true,
    sort_index: 152 + index,
    updated_at: now,
    variants,
  };
}

function normalizeLegacy(product) {
  const colours = COLOURS.map((colour) => colour.name);
  return {
    ...product,
    colours,
    colour_images: colours.map((colour) => ({
      colour,
      image_url: imageFor(colour),
    })),
    is_active: false,
  };
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const products = Array.isArray(catalog.products) ? catalog.products : [];

  const glass = products.filter((product) => product.category_id === GLASS_CATEGORY_ID);
  const legacy = glass.find((product) => product.id === LEGACY_ID);
  if (!legacy) throw new Error("Legacy Raindrop Glass bangles product not found.");

  const activeGlass = glass.filter((product) => product.is_active);
  const byColour = new Map();
  const duplicates = [];

  for (const product of activeGlass) {
    const colour = canonicalColour(product.colours?.[0] ?? product.variants?.[0]?.colour);
    if (!colour) throw new Error(`Active glass product ${product.slug} has no colour.`);
    const existing = byColour.get(colour);
    if (!existing) {
      byColour.set(colour, product);
      continue;
    }
    const keepExisting =
      existing.slug.endsWith(slugify(colour)) && !product.slug.endsWith(slugify(colour));
    if (keepExisting) {
      duplicates.push(product);
    } else {
      duplicates.push(existing);
      byColour.set(colour, product);
    }
  }

  const missing = COLOURS.map((colour) => colour.name).filter(
    (colour) => !byColour.has(colour),
  );
  if (missing.length) {
    throw new Error(`Missing active glass colours: ${missing.join(", ")}`);
  }

  const duplicateIds = new Set(duplicates.map((product) => product.id));
  const normalizedActive = COLOURS.map((colour, index) =>
    normalizeProduct(byColour.get(colour.name), index),
  );
  const normalizedById = new Map(normalizedActive.map((product) => [product.id, product]));

  catalog.products = products
    .filter((product) => !duplicateIds.has(product.id))
    .map((product) => {
      if (product.id === LEGACY_ID) return normalizeLegacy(product);
      return normalizedById.get(product.id) ?? product;
    });

  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `Normalized ${normalizedActive.length} active Glass Bangles products; removed ${duplicates.length} duplicate(s): ${duplicates
      .map((product) => product.slug)
      .join(", ") || "none"}.`,
  );
}

main();
