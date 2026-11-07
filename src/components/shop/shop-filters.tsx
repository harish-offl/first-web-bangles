"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildShopParams, type ShopFilterValue } from "@/lib/shop/params";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/site";
import type { Category } from "@/types";

interface ShopFiltersProps {
  pathname: string;
  categories: Category[];
  colours: string[];
  sizes?: string[];
  showCategories?: boolean;
  priceFloor: number;
  priceCeil: number;
  value: ShopFilterValue;
  total: number;
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
];

/**
 * Facet controls for the shop and collection listings. Every change rewrites
 * the query string (resetting to page one) so a filtered view is always
 * shareable and back-navigation works as expected.
 */
export function ShopFilters({
  pathname,
  categories,
  colours,
  sizes = [],
  showCategories = true,
  priceFloor,
  priceCeil,
  value,
  total,
}: ShopFiltersProps) {
  const router = useRouter();
  const [query, setQuery] = useState(value.q);
  const [minPrice, setMinPrice] = useState(value.minPrice);
  const [maxPrice, setMaxPrice] = useState(value.maxPrice);

  function navigate(patch: Partial<ShopFilterValue>) {
    const next: ShopFilterValue = { ...value, ...patch };
    const params = buildShopParams(next).toString();
    router.push(params ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  const activeCategories = categories.filter((c) => c.is_active);

  function toggleColour(colour: string) {
    const set = new Set(value.colours);
    if (set.has(colour)) set.delete(colour);
    else set.add(colour);
    navigate({ colours: [...set] });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: query.trim() });
  }

  function submitPrice(event: FormEvent) {
    event.preventDefault();
    navigate({ minPrice: minPrice.trim(), maxPrice: maxPrice.trim() });
  }

  const hasFilters =
    Boolean(value.q) ||
    Boolean(value.category) ||
    value.colours.length > 0 ||
    Boolean(value.size) ||
    Boolean(value.minPrice) ||
    Boolean(value.maxPrice) ||
    value.inStock;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={submitSearch} className="relative w-full sm:max-w-md" role="search">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, colour or code…"
            aria-label="Search products"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                navigate({ q: "" });
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </form>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline" aria-live="polite">
            {total} item{total === 1 ? "" : "s"}
          </span>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              value={value.sort}
              onChange={(event) => navigate({ sort: event.target.value })}
              className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg text-foreground">Refine</h2>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMinPrice("");
                setMaxPrice("");
                router.push(pathname, { scroll: false });
              }}
              className="text-xs font-medium text-gold-strong hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-1">
          {showCategories ? (
            <fieldset>
              <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Collection
              </legend>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <button
                    type="button"
                    onClick={() => navigate({ category: "" })}
                    aria-pressed={!value.category}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      !value.category
                        ? "border-gold-strong bg-brand-c100 font-medium text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-gold/60 hover:text-foreground",
                    )}
                  >
                    All
                  </button>
                </li>
                {activeCategories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ category: value.category === category.slug ? "" : category.slug })
                      }
                      aria-pressed={value.category === category.slug}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        value.category === category.slug
                          ? "border-gold-strong bg-brand-c100 font-medium text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-gold/60 hover:text-foreground",
                      )}
                    >
                      {category.name}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          {colours.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Colour
              </legend>
              <ul className="flex flex-wrap gap-2">
                {colours.map((colour) => {
                  const selected = value.colours.includes(colour);
                  return (
                    <li key={colour}>
                      <button
                        type="button"
                        onClick={() => toggleColour(colour)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm capitalize transition-colors",
                          selected
                            ? "border-gold-strong bg-brand-c100 font-medium text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-gold/60 hover:text-foreground",
                        )}
                      >
                        {colour}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          {sizes.length > 0 ? (
            <fieldset>
              <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Size
              </legend>
              <ul className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const selected = value.size === size;
                  return (
                    <li key={size}>
                      <button
                        type="button"
                        onClick={() => navigate({ size: selected ? "" : size })}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors",
                          selected
                            ? "border-gold-strong bg-brand-c100 font-medium text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-gold/60 hover:text-foreground",
                        )}
                      >
                        {size}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Price ({formatPrice(priceFloor)} – {formatPrice(priceCeil)})
            </legend>
            <form onSubmit={submitPrice} className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="Min"
                aria-label="Minimum price"
                className="h-10 w-24 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Max"
                aria-label="Maximum price"
                className="h-10 w-24 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
              <Button type="submit" variant="outline" size="lg" className="h-10">
                Apply
              </Button>
            </form>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Availability
            </legend>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={value.inStock}
                onChange={(event) => navigate({ inStock: event.target.checked })}
                className="size-4 accent-[var(--gold)]"
              />
              <span className="text-foreground">In stock only</span>
            </label>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
