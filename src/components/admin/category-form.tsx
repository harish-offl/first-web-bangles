"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save, Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import { saveCategoryAction, getCategoryAssignmentProducts, searchAssignableProducts } from "@/app/admin/actions";
import { initialActionState, type ActionState } from "@/lib/admin/action-state";
import { CheckboxRow, Field, FormMessage } from "@/components/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartImage } from "@/components/shared/smart-image";
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/types";
import { LocalImagePreview } from "@/components/admin/local-image-preview";
import { ColourPaletteForm } from "@/components/admin/colour-palette-form";
import { formatPrice } from "@/lib/site";
import type { ProductColour } from "@/types";

const PAGE_SIZE = 24;

interface CategoryFormProps {
  category?: Category | null;
  colourPalette?: ProductColour[];
}

export function CategoryForm({ category, colourPalette = [] }: CategoryFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCategoryAction,
    initialActionState,
  );
  const errors = state.status === "error" ? state.fieldErrors ?? {} : {};
  const isEdit = Boolean(category);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [palette, setPalette] = useState<ProductColour[]>(colourPalette);

  const [assignedProducts, setAssignedProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [availableTotal, setAvailableTotal] = useState(0);
  const [availablePage, setAvailablePage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc">("newest");
  const [searchLoading, setSearchLoading] = useState(false);

  const categoryId = category?.id ?? "";
  const isAssigned = (id: string) => assignedProducts.some((p) => p.id === id);

  // Load assigned products on mount (edit mode)
  useEffect(() => {
    if (categoryId) {
      getCategoryAssignmentProducts(categoryId).then((products) => {
        setAssignedProducts(products);
        setSelectedProductIds(new Set(products.map((p) => p.id)));
      });
    }
  }, [categoryId]);

  // Search available products
  const searchProducts = useCallback(
    async (page: number, q: string, sort: "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc") => {
      const result = await searchAssignableProducts({ q, page, pageSize: PAGE_SIZE, sort });
      setAvailableProducts(result.items);
      setAvailableTotal(result.total);
      setAvailablePage(result.page);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      await searchProducts(availablePage, searchQuery, sortOrder);
      if (!cancelled) setSearchLoading(false);
    })();
    return () => { cancelled = true; };
  }, [searchQuery, sortOrder, availablePage, searchProducts]);

  const pageCount = Math.max(1, Math.ceil(availableTotal / PAGE_SIZE));
  const selectedIds = Array.from(selectedProductIds);
  const count = selectedProductIds.size;

  const toggle = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectPage = () => {
    const pageIds = availableProducts.map((p) => p.id);
    const allSelected = pageIds.every((id) => selectedProductIds.has(id));
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedProductIds(new Set());

  return (
    <form action={formAction} className="max-w-4xl space-y-8">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      {/* Hidden input carrying selected product IDs to the server action */}
      <input
        type="hidden"
        name="category_product_ids"
        value={selectedIds.join(",")}
      />
      <input
        type="hidden"
        name="colour_palette_json"
        value={JSON.stringify(palette)}
      />
      <FormMessage state={state} />

      {/* Existing category fields */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <Field label="Name" htmlFor="name" error={errors.name} required>
          <Input id="name" name="name" defaultValue={category?.name ?? ""} required maxLength={80} />
        </Field>
        <Field label="Slug" htmlFor="slug" error={errors.slug} required hint="Used in the collection anchor (#cat-slug).">
          <Input
            id="slug"
            name="slug"
            defaultValue={category?.slug ?? ""}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase letters, numbers and hyphens only"
          />
        </Field>
        <Field label="Description" htmlFor="description" error={errors.description}>
          <Textarea
            id="description"
            name="description"
            defaultValue={category?.description ?? ""}
            maxLength={600}
            rows={3}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Image URL" htmlFor="image_url" error={errors.image_url}>
            <Input
              id="image_url"
              name="image_url"
              defaultValue={category?.image_url ?? ""}
              placeholder="https://... or leave blank to use uploaded file"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Paste a hosted URL, or upload a file below instead.
            </p>
          </Field>
          <Field
            label="Sort order"
            htmlFor="sort_order"
            error={errors.sort_order}
            hint="Lower numbers appear first."
          >
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min="0"
              step="1"
              defaultValue={category?.sort_order ?? 0}
            />
          </Field>
        </div>
        <Field label="Category image" htmlFor="category_image_file" error={errors.image_url}>
          <LocalImagePreview
            onImageSelect={(file) => setLocalFile(file)}
            label="Upload category image"
          />
          {localFile && (
            <p className="mt-1 text-xs text-muted-foreground">
              Selected: {localFile.name} ({(localFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </Field>
        <CheckboxRow
          id="is_active"
          name="is_active"
          label="Active"
          hint="Show this collection in navigation and filters."
          defaultChecked={category ? category.is_active : true}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-6">
        <ColourPaletteForm colours={palette} onChange={setPalette} />
      </section>

      {/* ========================================================================
         ASSIGN PRODUCTS TO THIS CATEGORY
         ======================================================================== */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Assign Products to This Category</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search, select, and assign products to “{category?.name ?? "this category"}”. Only explicitly selected
            products will be assigned when you save.
          </p>
        </div>

        {/* Category info header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h3 className="font-medium text-foreground">{category?.name ?? "New category"}</h3>
            <p className="text-xs text-muted-foreground">
              Slug: <span className="font-mono text-xs">{category?.slug ?? "—"}</span>
            </p>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Assigned products</p>
              <p className="font-display text-lg font-semibold text-foreground">{assignedProducts.length}</p>
            </div>
            <Badge variant={assignedProducts.length > 0 ? "default" : "secondary"}>
              {assignedProducts.length > 0 ? "Active" : "Empty"}
            </Badge>
          </div>
        </div>

        {/* Search and filters */}
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="search"
              placeholder="Search by name or SKU…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAvailablePage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(value ?? "newest");
              setAvailablePage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="name-asc">Name (A–Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z–A)</SelectItem>
              <SelectItem value="price-asc">Price (low to high)</SelectItem>
              <SelectItem value="price-desc">Price (high to low)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setAvailablePage(1);
              }}
              disabled={!searchQuery}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-end justify-end text-xs text-muted-foreground">
            {availableTotal} product{availableTotal !== 1 ? "s" : ""} found
          </div>
        </div>

        {/* Product selection grid */}
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border text-xs tracking-[0.12em] text-muted-foreground uppercase bg-brand-c50">
                <th className="px-4 py-3 text-center w-10">Select</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">In category</th>
              </tr>
            </thead>
            <tbody>
              {availableProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {searchLoading ? "Loading products…" : "No products found."}
                  </td>
                </tr>
              ) : (
                availableProducts.map((product) => {
                  const checked = selectedProductIds.has(product.id);
                  return (
                    <tr key={product.id} className="border-b border-border hover:bg-brand-c50/30 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(product.id)}
                          className="size-4 shrink-0 accent-[var(--gold)]"
                          aria-label={`Select ${product.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                      <span className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-border bg-brand-c100">
                        <SmartImage
                          src={product.primary_image_url}
                          alt=""
                          fill
                          sizes="32px"
                          className="object-cover"
                        />
                      </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{product.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {product.sku ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatPrice(product.price)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={product.is_active ? "default" : "outline"}>
                          {product.is_active ? "Active" : "Hidden"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isAssigned(product.id) ? (
                          <Badge variant="secondary" className="text-[0.65rem]">
                            Assigned
                          </Badge>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bulk selection controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{count}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={availableProducts.length === 0}
              onClick={selectPage}
            >
              {availableProducts.every((p) => selectedProductIds.has(p.id)) ? "Deselect all on page" : "Select all on page"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={count === 0}
              onClick={clearSelection}
            >
              Clear selection
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {availablePage > 1 && (
              <Button variant="outline" size="icon-sm" onClick={() => setAvailablePage(availablePage - 1)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Page {availablePage} of {pageCount}
            </span>
            {availablePage < pageCount && (
              <Button variant="outline" size="icon-sm" onClick={() => setAvailablePage(availablePage + 1)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        {/* Selected products preview */}
        <div className="mt-6 border-t border-border pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Selected Products</h3>
            <p className="text-xs text-muted-foreground">
              {count} product{count !== 1 ? "s" : ""} will be assigned
            </p>
          </div>

          {count === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No products selected. Use the grid above to choose products to assign.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {assignedProducts
                .filter((p) => selectedProductIds.has(p.id))
                .map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-lg border border-brand-c200 bg-brand-c50/50 p-2"
                  >
                    <span className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                      <SmartImage
                        src={product.primary_image_url}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {product.sku ?? "No SKU"} · {formatPrice(product.price)}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => toggle(product.id)}
                      aria-label={`Remove ${product.name} from selection`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending} className="h-11 gap-2 text-base">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {isEdit ? "Save changes" : "Create category"}
        </Button>
        <Link
          href="/admin/categories"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 text-base")}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
