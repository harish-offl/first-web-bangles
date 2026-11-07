import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SmartImage } from "@/components/shared/smart-image";
import { getCatalog } from "@/lib/data";
import { getAdminProductColours } from "@/lib/admin/queries";

import AddSizeForm from "./AddSizeForm";
import StockUpdateForm from "./StockUpdateForm";

interface ManageStockPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}

export default async function ManageStockPage({
  params,
  searchParams,
}: ManageStockPageProps) {
  const { id } = await params;
  const { saved, deleted, error } = await searchParams;
  const catalog = getCatalog();
  const product = await catalog.getProductById(id);

  if (!product) return null;

  const variants = [...(product.variants ?? [])].sort((a, b) => {
    const colour = (a.colour ?? "").localeCompare(b.colour ?? "");
    if (colour !== 0) return colour;
    return (a.size ?? a.variant_value).localeCompare(b.size ?? b.variant_value);
  });
  const totalStock = variants.reduce(
    (sum, variant) => sum + (variant.stock_quantity ?? 0),
    0,
  );
  const palette = product.category_id
    ? await getAdminProductColours(product.category_id)
    : [];
  const productColour =
    product.colours?.[0]?.trim() ||
    variants.find((variant) => variant.colour)?.colour?.trim() ||
    null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to inventory
        </Link>
        {saved || deleted ? (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-foreground"
          >
            {deleted ? "Size removed." : "Stock updated."}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Could not remove that size.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-brand-c100">
            <SmartImage
              src={product.primary_image_url}
              alt={product.name}
              fill
              sizes="56px"
              className="object-cover"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {product.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Product ID: {product.id} · Category: {product.category_id ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              SKU: {product.sku ?? "—"} · Price: ₹{product.price.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {variants.length} size{variants.length === 1 ? "" : "s"} configured ·{" "}
              {totalStock} total stock
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <StockUpdateForm product={product} variants={variants} />
          <AddSizeForm
            productId={product.id}
            palette={palette}
            productColour={productColour}
          />
        </div>
      </div>
    </>
  );
}
