import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEGACY_HOST = process.env.LEGACY_SUPABASE_HOST ?? "ofcemustbpzfzmpohivp.supabase.co";
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PUBLIC_MARKER = "/storage/v1/object/public/";
const BUCKET = "product-images";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateRow(table, id, values, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { error } = await supabase.from(table).update(values).eq("id", id);
      if (!error) return;
      lastError = new Error(`${table} ${id}: ${error.message}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(attempt * 1000);
  }
  throw lastError;
}

async function selectAll(table, columns) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    from += 1000;
  }
  return rows;
}

function parseStorageRef(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.hostname !== LEGACY_HOST) return null;
    const index = url.pathname.indexOf(PUBLIC_MARKER);
    if (index < 0) return null;
    const rest = decodeURIComponent(url.pathname.slice(index + PUBLIC_MARKER.length));
    const [bucket, ...parts] = rest.split("/");
    if (!bucket || parts.length === 0) return null;
    return { bucket, objectPath: parts.join("/") };
  } catch {
    return null;
  }
}

function replaceUrl(value, map) {
  return typeof value === "string" ? map.get(value) ?? value : value;
}

const tables = {
  products: await selectAll(
    "products",
    "id, name, slug, primary_image_url, colour_images, updated_at",
  ),
  product_images: await selectAll(
    "product_images",
    "id, product_id, image_url, storage_path",
  ),
  product_colours: await selectAll("product_colours", "id, name, image_url"),
  product_variants: await selectAll(
    "product_variants",
    "id, product_id, colour, image_url",
  ),
  categories: await selectAll("categories", "id, name, image_url"),
};

const urlRecords = [];
for (const row of tables.categories) {
  urlRecords.push({ table: "categories", id: row.id, field: "image_url", url: row.image_url });
}
for (const row of tables.products) {
  urlRecords.push({ table: "products", id: row.id, field: "primary_image_url", url: row.primary_image_url });
  for (const entry of row.colour_images ?? []) {
    urlRecords.push({
      table: "products",
      id: row.id,
      field: "colour_images",
      url: entry?.image_url,
      colour: entry?.colour,
    });
  }
}
for (const row of tables.product_images) {
  urlRecords.push({ table: "product_images", id: row.id, field: "image_url", url: row.image_url });
  urlRecords.push({ table: "product_images", id: row.id, field: "storage_path", url: row.storage_path });
}
for (const row of tables.product_colours) {
  urlRecords.push({ table: "product_colours", id: row.id, field: "image_url", url: row.image_url });
}
for (const row of tables.product_variants) {
  urlRecords.push({ table: "product_variants", id: row.id, field: "image_url", url: row.image_url });
}

const uniqueOldUrls = [...new Set(urlRecords.map((record) => record.url).filter((url) => parseStorageRef(url)))];
const refs = uniqueOldUrls.map((url) => ({ url, ...parseStorageRef(url) }));

console.log(`Legacy host: ${LEGACY_HOST}`);
console.log(`Current project: ${SUPABASE_URL}`);
console.log(`Referenced legacy image URLs: ${uniqueOldUrls.length}`);
console.log(`Mode: ${APPLY ? "APPLY" : "dry run"}`);

if (!APPLY) {
  for (const ref of refs.slice(0, 20)) {
    console.log(`- ${ref.bucket}/${ref.objectPath}`);
  }
  if (refs.length > 20) console.log(`... and ${refs.length - 20} more`);
  console.log("Re-run with --apply to copy objects and rewrite database URLs.");
  process.exit(0);
}

await mkdir(".data", { recursive: true });
const backupPath = `.data/image-storage-migration-backup-${Date.now()}.json`;
await writeFile(
  backupPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), legacyHost: LEGACY_HOST, tables }, null, 2),
);
console.log(`Backup: ${backupPath}`);

const map = new Map();
let copied = 0;
let alreadyCurrent = 0;

for (const ref of refs) {
  if (ref.bucket !== BUCKET) {
    console.warn(`Skipping unsupported bucket: ${ref.bucket}/${ref.objectPath}`);
    continue;
  }

  const head = await fetch(ref.url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
  if (!head.ok) {
    console.warn(`Source missing (${head.status}): ${ref.url}`);
    continue;
  }

  const response = await fetch(ref.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    console.warn(`Source download failed (${response.status}): ${ref.url}`);
    continue;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(ref.objectPath, buffer, {
    contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) {
    let lastError = uploadError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sleep(attempt * 1000);
      const retry = await supabase.storage.from(BUCKET).upload(ref.objectPath, buffer, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });
      if (!retry.error) {
        lastError = null;
        break;
      }
      lastError = retry.error;
    }
    if (lastError) {
      throw new Error(`Upload failed for ${ref.objectPath}: ${lastError.message}`);
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ref.objectPath);
  const verify = await fetch(data.publicUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(30_000),
  });
  if (!verify.ok) {
    throw new Error(`Uploaded object is not readable (${verify.status}): ${data.publicUrl}`);
  }

  map.set(ref.url, data.publicUrl);
  copied += 1;
  if (copied % 25 === 0) console.log(`Copied ${copied}/${refs.length}`);
}

if (map.size === 0) {
  console.log("No legacy objects were copied; nothing to update.");
  process.exit(0);
}

for (const row of tables.categories) {
  const next = replaceUrl(row.image_url, map);
  if (next === row.image_url) continue;
  await updateRow("categories", row.id, { image_url: next });
}

for (const row of tables.products) {
  const nextPrimary = replaceUrl(row.primary_image_url, map);
  const nextColours = Array.isArray(row.colour_images)
    ? row.colour_images.map((entry) => ({
        ...entry,
        image_url: replaceUrl(entry?.image_url, map),
      }))
    : row.colour_images;
  const primaryChanged = nextPrimary !== row.primary_image_url;
  const coloursChanged = JSON.stringify(nextColours) !== JSON.stringify(row.colour_images);
  if (!primaryChanged && !coloursChanged) continue;
  await updateRow("products", row.id, {
    primary_image_url: nextPrimary,
    colour_images: nextColours,
    updated_at: new Date().toISOString(),
  });
}

for (const row of tables.product_images) {
  const nextImage = replaceUrl(row.image_url, map);
  const nextStorage = replaceUrl(row.storage_path, map);
  if (nextImage === row.image_url && nextStorage === row.storage_path) continue;
  await updateRow("product_images", row.id, {
    image_url: nextImage,
    storage_path: nextStorage,
  });
}

for (const row of tables.product_colours) {
  const next = replaceUrl(row.image_url, map);
  if (next === row.image_url) continue;
  await updateRow("product_colours", row.id, {
    image_url: next,
    updated_at: new Date().toISOString(),
  });
}

for (const row of tables.product_variants) {
  const next = replaceUrl(row.image_url, map);
  if (next === row.image_url) continue;
  await updateRow("product_variants", row.id, { image_url: next });
}

console.log(`Copied ${copied} objects (${alreadyCurrent} already current).`);
console.log(`Rewrote ${map.size} legacy URLs to ${SUPABASE_URL}.`);

const leftovers = [];
for (const row of await selectAll("products", "id, primary_image_url, colour_images")) {
  if (String(row.primary_image_url ?? "").includes(LEGACY_HOST)) leftovers.push(`products.primary_image_url ${row.id}`);
  for (const entry of row.colour_images ?? []) {
    if (String(entry?.image_url ?? "").includes(LEGACY_HOST)) leftovers.push(`products.colour_images ${row.id}`);
  }
}
for (const row of await selectAll("product_images", "id, image_url, storage_path")) {
  if (String(row.image_url ?? "").includes(LEGACY_HOST)) leftovers.push(`product_images.image_url ${row.id}`);
  if (String(row.storage_path ?? "").includes(LEGACY_HOST)) leftovers.push(`product_images.storage_path ${row.id}`);
}
for (const row of await selectAll("product_colours", "id, image_url")) {
  if (String(row.image_url ?? "").includes(LEGACY_HOST)) leftovers.push(`product_colours.image_url ${row.id}`);
}
for (const row of await selectAll("product_variants", "id, image_url")) {
  if (String(row.image_url ?? "").includes(LEGACY_HOST)) leftovers.push(`product_variants.image_url ${row.id}`);
}

if (leftovers.length) {
  console.warn(`Remaining legacy references: ${leftovers.length}`);
  for (const line of leftovers.slice(0, 20)) console.warn(`- ${line}`);
  process.exitCode = 1;
} else {
  console.log("No legacy image references remain.");
}
