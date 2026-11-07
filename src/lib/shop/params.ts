import type { ProductFilters } from "@/types";

/** Query-string shape for listing pages, shared by server pages and the client filter bar. */
export interface ShopFilterValue {
  q: string;
  category: string;
  colours: string[];
  size: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  sort: string;
}

export const DEFAULT_SHOP_VALUE: ShopFilterValue = {
  q: "",
  category: "",
  colours: [],
  size: "",
  minPrice: "",
  maxPrice: "",
  inStock: false,
  sort: "newest",
};

type RawParams = Record<string, string | string[] | undefined>;

const SORT_VALUES = ["newest", "price-asc", "price-desc", "name-asc", "name-desc"] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads a page's `searchParams` into a normalised list-view value. */
export function parseShopValue(params: RawParams): ShopFilterValue {
  const colourRaw = params.colour;
  const colours = (Array.isArray(colourRaw) ? colourRaw : colourRaw ? [colourRaw] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

  const sort = first(params.sort);

  return {
    q: first(params.q).trim(),
    category: first(params.category).trim(),
    colours,
    size: first(params.size).trim(),
    minPrice: first(params.minPrice).trim(),
    maxPrice: first(params.maxPrice).trim(),
    inStock: first(params.inStock) === "1" || first(params.inStock) === "true",
    sort: (SORT_VALUES as readonly string[]).includes(sort) ? sort : "newest",
  };
}

function toNumber(value: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Converts a list-view value into driver filters for a given page. */
export function shopValueToFilters(value: ShopFilterValue, page = 1): ProductFilters {
  return {
    q: value.q || undefined,
    category: value.category || undefined,
    colour: value.colours.length ? value.colours : undefined,
    size: value.size || undefined,
    minPrice: toNumber(value.minPrice),
    maxPrice: toNumber(value.maxPrice),
    inStock: value.inStock || undefined,
    sort: value.sort as ProductFilters["sort"],
    page,
    pageSize: 24,
  };
}

/** Serialises a list-view value (excluding page) back into a query string. */
export function buildShopParams(value: ShopFilterValue): URLSearchParams {
  const params = new URLSearchParams();
  if (value.q) params.set("q", value.q);
  if (value.category) params.set("category", value.category);
  if (value.colours.length) params.set("colour", value.colours.join(","));
  if (value.size) params.set("size", value.size);
  if (value.minPrice) params.set("minPrice", value.minPrice);
  if (value.maxPrice) params.set("maxPrice", value.maxPrice);
  if (value.inStock) params.set("inStock", "1");
  if (value.sort && value.sort !== "newest") params.set("sort", value.sort);
  return params;
}
