import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = (process.env.AUDIT_SITE_URL ?? "https://www.banglesbybeauty.in").replace(/\/$/, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const records = [];

function addRecord(source, id, label, url) {
  records.push({ source, id, label, url: url ?? null });
}

function classify(url) {
  if (!url) return "empty";
  const value = url.trim();
  if (!value) return "empty";
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\")) return "local-disk";
  if (value.startsWith("data:")) return "data";
  if (value.startsWith("/")) return "relative";
  try {
    const parsed = new URL(value);
    if (parsed.hostname.endsWith(".supabase.co")) return "supabase";
    return "external";
  } catch {
    return "malformed";
  }
}

function resolveAbsolute(url) {
  if (!url) return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith("/")) return `${SITE_URL}${value}`;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\")) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

async function httpCheck(url, method = "HEAD") {
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      headers: {
        "User-Agent": "BanglesImageAudit/1.0",
        ...(method === "GET" ? { Range: "bytes=0-1023" } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      finalUrl: response.url,
    };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message ?? error) };
  }
}

async function checkRaw(url) {
  const absolute = resolveAbsolute(url);
  if (!absolute) return { ok: false, status: 0, error: "not http-resolvable" };
  const head = await httpCheck(absolute);
  if (head.ok) return head;
  const get = await httpCheck(absolute, "GET");
  return get.ok ? { ...get, method: "GET" } : head;
}

async function checkOptimizer(url) {
  const absolute = resolveAbsolute(url);
  if (!absolute) return { ok: false, status: 0, error: "not http-resolvable" };
  const optimizer = `${SITE_URL}/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`;
  const result = await httpCheck(optimizer, "GET");
  return { ...result, optimizer };
}

/**
 * Reproduces `src/lib/images/loader.js`: every image is served through the
 * app's own sharp-powered resize endpoint, so the deployed site no longer
 * depends on Vercel's image-optimizer quota.
 */
function loaderUrl(url, width = 640, quality = 75) {
  if (!url) return null;
  const value = url.trim();
  if (!value) return null;
  return `${SITE_URL}/api/image?url=${encodeURIComponent(value)}&w=${width}&q=${quality}`;
}

function localFileFor(url) {
  if (!url || !url.startsWith("/")) return null;
  const clean = decodeURIComponent(url.split("?")[0].split("#")[0]).replace(/^\/+/, "");
  return path.join(process.cwd(), "public", clean);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) {
  console.error("Could not list storage buckets:", bucketError.message);
}

const [categories, products, images, colours, variants] = await Promise.all([
  supabase.from("categories").select("id, name, slug, image_url, is_active"),
  supabase
    .from("products")
    .select("id, name, slug, sku, primary_image_url, is_active, category_id")
    .order("name"),
  supabase.from("product_images").select("id, product_id, image_url, storage_path"),
  supabase.from("product_colours").select("id, name, category_id, image_url, is_active"),
  supabase.from("product_variants").select("id, product_id, colour, image_url, is_active"),
]);

for (const row of categories.data ?? []) {
  addRecord("categories.image_url", row.id, `${row.name} (${row.slug})`, row.image_url);
}
for (const row of products.data ?? []) {
  addRecord("products.primary_image_url", row.id, `${row.name} (${row.slug})`, row.primary_image_url);
}
for (const row of images.data ?? []) {
  addRecord("product_images.image_url", row.id, row.product_id, row.image_url);
  if (row.storage_path && row.storage_path !== row.image_url) {
    addRecord("product_images.storage_path", row.id, row.product_id, row.storage_path);
  }
}
for (const row of colours.data ?? []) {
  addRecord(
    "product_colours.image_url",
    row.id,
    `${row.name} (${row.category_id})${row.is_active ? "" : " [inactive]"}`,
    row.image_url,
  );
}
for (const row of variants.data ?? []) {
  addRecord(
    "product_variants.image_url",
    row.id,
    `${row.colour ?? "no colour"} (${row.product_id})${row.is_active ? "" : " [inactive]"}`,
    row.image_url,
  );
}

const unique = new Map();
for (const record of records) {
  const kind = classify(record.url);
  if (!unique.has(record.url ?? "")) {
    unique.set(record.url ?? "", { url: record.url, kind, checks: null });
  }
}

const entries = [...unique.values()];
await mapLimit(entries, 8, async (entry) => {
  if (!entry.url || entry.kind === "empty" || entry.kind === "malformed" || entry.kind === "local-disk") {
    entry.checks = { raw: { ok: false, status: 0, error: "unusable image reference" } };
    return;
  }
  if (entry.kind === "relative") {
    entry.localExists = existsSync(localFileFor(entry.url));
  }
  entry.checks = {
    raw: await checkRaw(entry.url),
    loader: await httpCheck(loaderUrl(entry.url), "GET"),
    optimizer: await checkOptimizer(entry.url),
  };
});

const brokenRecords = records.filter((record) => {
  const entry = unique.get(record.url ?? "");
  if (!entry) return true;
  if (entry.kind === "empty" || entry.kind === "malformed" || entry.kind === "local-disk") return true;
  if (entry.kind === "relative" && entry.localExists === false) return true;
  return !entry.checks?.loader?.ok;
});

const kindCounts = {};
for (const entry of entries) {
  kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;
}

const storageRefs = records
  .map((record) => {
    const value = record.url?.trim();
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (!parsed.hostname.endsWith(".supabase.co")) return null;
      const marker = "/storage/v1/object/public/";
      const signedMarker = "/storage/v1/object/sign/";
      const markerUsed = parsed.pathname.includes(marker)
        ? marker
        : parsed.pathname.includes(signedMarker)
          ? signedMarker
          : null;
      if (!markerUsed) return { record, bucket: null, objectPath: null, signed: false };
      const rest = parsed.pathname.slice(parsed.pathname.indexOf(markerUsed) + markerUsed.length);
      const [bucket, ...objectParts] = decodeURIComponent(rest).split("/");
      return {
        record,
        bucket,
        objectPath: objectParts.join("/"),
        signed: markerUsed === signedMarker,
      };
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const missingStorageObjects = [];
for (const ref of storageRefs) {
  if (!ref.bucket || !ref.objectPath) continue;
  const slash = ref.objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? ref.objectPath.slice(0, slash) : "";
  const filename = slash >= 0 ? ref.objectPath.slice(slash + 1) : ref.objectPath;
  const { data, error } = await supabase.storage.from(ref.bucket).list(folder || undefined, {
    search: filename,
    limit: 100,
  });
  const exists = !error && (data ?? []).some((item) => item.name === filename);
  if (!exists) {
    missingStorageObjects.push({
      source: ref.record.source,
      label: ref.record.label,
      bucket: ref.bucket,
      objectPath: ref.objectPath,
      error: error?.message ?? null,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  supabaseUrl: SUPABASE_URL,
  buckets: (buckets ?? []).map((bucket) => ({
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
  })),
  counts: {
    records: records.length,
    uniqueUrls: entries.length,
    brokenRecords: brokenRecords.length,
    missingStorageObjects: missingStorageObjects.length,
    byKind: kindCounts,
  },
  brokenRecords,
  missingStorageObjects,
  records,
  uniqueUrls: entries.map((entry) => ({
    url: entry.url,
    kind: entry.kind,
    localExists: entry.localExists ?? null,
    raw: entry.checks?.raw ?? null,
    loader: entry.checks?.loader ?? null,
    vercelOptimizer: entry.checks?.optimizer ?? null,
  })),
};

await mkdir(".data", { recursive: true });
const output = `.data/image-audit-${Date.now()}.json`;
await writeFile(output, JSON.stringify(report, null, 2));

console.log(`Buckets: ${report.buckets.map((b) => `${b.name}${b.public ? " (public)" : " (private)"}`).join(", ") || "none"}`);
console.log(`Records: ${report.counts.records} | unique URLs: ${report.counts.uniqueUrls}`);
console.log(`By kind: ${JSON.stringify(report.counts.byKind)}`);
console.log(`Broken references: ${report.counts.brokenRecords}`);
console.log(`Missing storage objects: ${report.counts.missingStorageObjects}`);
console.log(`Report: ${output}`);

if (brokenRecords.length) {
  console.log("\nBroken references:");
  for (const record of brokenRecords.slice(0, 40)) {
    const entry = unique.get(record.url ?? "");
    const raw = entry?.checks?.raw;
    const loader = entry?.checks?.loader;
    console.log(
      `- [${record.source}] ${record.label}: ${record.url ?? "<empty>"} | raw=${raw?.status ?? "?"} loader=${loader?.status ?? "?"}${loader?.error ? ` (${loader.error})` : ""}`,
    );
  }
  if (brokenRecords.length > 40) console.log(`... and ${brokenRecords.length - 40} more`);
}

if (missingStorageObjects.length) {
  console.log("\nMissing storage objects:");
  for (const item of missingStorageObjects.slice(0, 40)) {
    console.log(`- ${item.bucket}/${item.objectPath} (${item.label})${item.error ? `: ${item.error}` : ""}`);
  }
}
