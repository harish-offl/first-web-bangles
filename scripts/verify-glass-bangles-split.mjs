// Verifies the Glass Bangles colour split in Supabase.
// Usage: node scripts/verify-glass-bangles-split.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_COLOURS = [
  "Forest Green",
  "Maroon",
  "Orange",
  "Pink",
  "Pista Green",
  "Red",
  "Rust Orange",
];
const EXPECTED_SIZES = ["2.2", "2.4", "2.6", "2.8", "2.10"];
const LEGACY_ID = "ec3ce521-740c-5e32-819e-b893ebbbdf17";

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

const checks = [];
function check(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const category = unwrap(
    await supabase.from("categories").select("*").eq("slug", "glass-bangles").single(),
    "category",
  );
  const products = unwrap(
    await supabase.from("products").select("*").eq("category_id", category.id),
    "products",
  );
  const active = products.filter((product) => product.is_active);
  const legacy = products.find((product) => product.id === LEGACY_ID);
  const assignments = unwrap(
    await supabase
      .from("category_products")
      .select("product_id")
      .eq("category_id", category.id),
    "category_products",
  );
  const variants = unwrap(
    await supabase
      .from("product_variants")
      .select("*")
      .in("product_id", active.map((product) => product.id)),
    "variants",
  );
  const palette = unwrap(
    await supabase.from("product_colours").select("*").eq("category_id", category.id),
    "palette",
  );

  check(active.length === 7, `expected 7 active products, found ${active.length}`);
  const activeColours = active.map((product) => product.colours?.[0]).sort();
  check(
    JSON.stringify(activeColours) === JSON.stringify([...EXPECTED_COLOURS].sort()),
    `active colours match expected set: ${activeColours.join(", ")}`,
  );
  check(
    active.every((product) => (product.colours ?? []).length === 1),
    "every active product must have exactly one colour",
  );
  check(
    active.every((product) => product.slug && product.primary_image_url),
    "every active product needs a slug and primary image",
  );
  check(
    new Set(active.map((product) => product.slug)).size === active.length,
    "active slugs are unique",
  );
  check(
    new Set(active.map((product) => product.sku)).size === active.length,
    "active SKUs are unique",
  );
  check(Boolean(legacy && legacy.is_active === false), "legacy product must be inactive");
  check(
    !assignments.some((row) => row.product_id === LEGACY_ID),
    "legacy product must not be assigned to Glass Bangles",
  );
  check(
    assignments.length === active.length &&
      assignments.every((row) => active.some((product) => product.id === row.product_id)),
    "category assignments must match active products only",
  );

  for (const product of active) {
    const own = variants.filter((variant) => variant.product_id === product.id);
    const sizes = own
      .filter((variant) => variant.is_active !== false)
      .map((variant) => String(variant.size ?? variant.variant_value).trim())
      .sort();
    check(
      sizes.length === EXPECTED_SIZES.length &&
        JSON.stringify(sizes) === JSON.stringify([...EXPECTED_SIZES].sort()),
      `${product.slug}: expected sizes ${EXPECTED_SIZES.join(", ")}, found ${sizes.join(", ")}`,
    );
    check(
      own.every(
        (variant) =>
          !variant.colour ||
          variant.colour.trim().toLowerCase() === product.colours[0].trim().toLowerCase(),
      ),
      `${product.slug}: variants contain a different colour`,
    );
  }

  const orange = palette.find((row) => row.name.trim().toLowerCase() === "orange");
  check(
    orange?.image_url === "/images/products/colors/bng-159-orange.jpg",
    `Orange palette image is ${orange?.image_url ?? "missing"}`,
  );

  let failed = false;
  for (const item of checks) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.message}`);
    if (!item.ok) failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
