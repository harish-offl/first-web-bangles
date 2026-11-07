"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BANGLE_SIZES } from "@/lib/product-sizes";
import type { ColourImage, Product, ProductColour, ProductVariant } from "@/types";

interface ColourVariantFormProps {
  palette: ProductColour[];
  product?: Product;
}

function makeVariant(
  colour: string,
  hex: string,
  size: string,
  imageUrl: string | null,
): ProductVariant {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_id: "",
    variant_name: "Size",
    variant_value: size,
    size,
    colour,
    colour_hex: hex,
    image_url: imageUrl,
    sku: null,
    stock_quantity: null,
    // The storefront adds the standard size surcharge (2.10) on top of the
    // base price, so auto-created variants leave the override empty.
    price_override: null,
    is_active: true,
  };
}

// Synthetic ids only identify rows inside the form; the server ignores ids that
// are not already in the database and creates those rows.
export function ColourVariantForm({ palette, product }: ColourVariantFormProps) {
  const initialColour = useMemo(() => {
    const fromProduct = product?.colours?.[0];
    if (fromProduct) return fromProduct;
    const fromVariant = product?.variants?.find((variant) => variant.colour)?.colour;
    if (fromVariant) return fromVariant;
    // Existing size-only rows must not be dropped when the admin form opens;
    // default them to the first active palette colour instead of every colour.
    if ((product?.variants ?? []).length > 0) {
      return palette.find((colour) => colour.is_active)?.name ?? "";
    }
    return "";
  }, [palette, product]);

  const [selectedColour, setSelectedColour] = useState(initialColour);
  const [variants, setVariants] = useState<ProductVariant[]>(() =>
    (product?.variants ?? []).map((variant) => ({
      ...variant,
      size: variant.size ?? variant.variant_value,
      colour: variant.colour ?? initialColour,
    })),
  );
  const [colourImages, setColourImages] = useState<ColourImage[]>(
    () => product?.colour_images ?? [],
  );

  const paletteByName = useMemo(() => {
    const map = new Map<string, ProductColour>();
    for (const colour of palette) map.set(colour.name.trim().toLowerCase(), colour);
    return map;
  }, [palette]);

  function colourMeta(name: string) {
    return paletteByName.get(name.trim().toLowerCase());
  }

  const colourOptions = useMemo(() => {
    const active = palette.filter((colour) => colour.is_active);
    if (
      selectedColour &&
      !active.some(
        (colour) => colour.name.trim().toLowerCase() === selectedColour.trim().toLowerCase(),
      )
    ) {
      const existing = paletteByName.get(selectedColour.trim().toLowerCase());
      if (existing) return [...active, existing];
    }
    return active;
  }, [palette, paletteByName, selectedColour]);

  function selectColour(name: string) {
    if (!name || name === selectedColour) return;
    const meta = colourMeta(name);
    const hex = meta?.hex_code ?? "#C9A227";
    const imageUrl = meta?.image_url ?? null;

    setSelectedColour(name);
    setVariants((prev) => {
      if (prev.length === 0) {
        return BANGLE_SIZES.map((size) => makeVariant(name, hex, size.label, imageUrl));
      }
      return prev.map((variant) => ({
        ...variant,
        colour: name,
        colour_hex: hex,
        image_url: imageUrl,
      }));
    });
    setColourImages((prev) => {
      const others = prev.filter(
        (image) => image.colour.toLowerCase() !== name.toLowerCase(),
      );
      return imageUrl ? [...others, { colour: name, image_url: imageUrl }] : others;
    });
  }

  function addSize() {
    if (!selectedColour) return;
    const meta = colourMeta(selectedColour);
    const hex = meta?.hex_code ?? "#C9A227";
    const used = new Set(
      variants.map((variant) =>
        (variant.size ?? variant.variant_value).toLowerCase(),
      ),
    );
    const next = BANGLE_SIZES.find((size) => !used.has(size.label.toLowerCase()));
    if (!next) return;
    setVariants((prev) => [
      ...prev,
      makeVariant(selectedColour, hex, next.label, meta?.image_url ?? null),
    ]);
  }

  function updateVariant(id: string, patch: Partial<ProductVariant>) {
    setVariants((prev) =>
      prev.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)),
    );
  }

  function removeVariant(id: string) {
    setVariants((prev) => prev.filter((variant) => variant.id !== id));
  }

  function setImage(imageUrl: string) {
    if (!selectedColour) return;
    setColourImages((prev) => {
      const others = prev.filter(
        (image) => image.colour.toLowerCase() !== selectedColour.toLowerCase(),
      );
      return imageUrl.trim()
        ? [...others, { colour: selectedColour, image_url: imageUrl.trim() }]
        : others;
    });
  }

  const submittedColours = selectedColour ? [selectedColour] : [];

  const submittedVariants = selectedColour
    ? variants.filter(
        (variant) =>
          !variant.colour ||
          variant.colour.trim().toLowerCase() === selectedColour.trim().toLowerCase(),
      )
    : [];

  const explicitImage = colourImages.find(
    (image) => image.colour.toLowerCase() === selectedColour.toLowerCase(),
  );
  const submittedImageUrl =
    explicitImage?.image_url.trim() || colourMeta(selectedColour)?.image_url || "";
  const submittedImages = submittedImageUrl
    ? [{ colour: selectedColour, image_url: submittedImageUrl }]
    : [];

  const imageValue =
    explicitImage?.image_url ?? colourMeta(selectedColour)?.image_url ?? "";
  const selectedMeta = colourMeta(selectedColour);
  const selectedHex = selectedMeta?.hex_code ?? "#C9A227";

  return (
    <div className="space-y-4">
      <input type="hidden" name="colours" value={submittedColours.join(", ")} />
      <input
        type="hidden"
        name="variants_json"
        value={JSON.stringify(
          submittedVariants.map((variant) => ({
            id: variant.id.startsWith("new-") ? undefined : variant.id,
            variant_name: variant.variant_name,
            variant_value: variant.size ?? variant.variant_value,
            size: variant.size ?? variant.variant_value,
            colour: variant.colour ?? null,
            colour_hex: variant.colour_hex ?? null,
            image_url: variant.image_url ?? null,
            sku: variant.sku ?? null,
            stock_quantity: variant.stock_quantity,
            price_override: variant.price_override,
            is_active: variant.is_active,
          })),
        )}
      />
      <input
        type="hidden"
        name="colour_images_json"
        value={JSON.stringify(submittedImages)}
      />

      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Colour &amp; sizes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each Glass Bangles product is a single colour. Pick one colour from the
          category palette, then set its size and stock rows. Leave stock blank
          when the colour is made to order.
        </p>
      </div>

      {palette.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          This category has no colour palette yet. Add colours under Admin →
          Categories first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colourOptions.map((colour) => {
            const selected =
              colour.name.trim().toLowerCase() === selectedColour.trim().toLowerCase();
            return (
              <button
                key={colour.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectColour(colour.name)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border border-black/10"
                  style={{ backgroundColor: colour.hex_code }}
                />
                {colour.name}
                {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
              </button>
            );
          })}
          {colourOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active palette colours. Add one under Admin → Categories.
            </p>
          ) : null}
        </div>
      )}

      {!selectedColour ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Choose one colour above to create its size rows.
        </p>
      ) : (
        <section className="rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <span
              aria-hidden="true"
              className="size-5 rounded-full border border-black/10"
              style={{ backgroundColor: selectedHex }}
            />
            <h3 className="font-display text-base font-semibold text-foreground">
              {selectedColour}
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              One colour per product
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSize}
              className="ml-auto h-8 gap-1.5"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add size
            </Button>
          </header>

          <div className="space-y-3 p-4">
            <div className="space-y-1.5">
              <label
                htmlFor="colour-image"
                className="text-xs font-medium text-muted-foreground"
              >
                Colour image (optional)
              </label>
              <Input
                id="colour-image"
                value={imageValue}
                onChange={(event) => setImage(event.target.value)}
                placeholder="/images/products/colors/bng-159-forest-green.jpg"
              />
            </div>

            {variants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sizes yet. Add at least one size to sell this colour.
              </p>
            ) : (
              <div className="space-y-2">
                {variants.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    onUpdate={updateVariant}
                    onRemove={removeVariant}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

interface VariantRowProps {
  variant: ProductVariant;
  onUpdate: (id: string, patch: Partial<ProductVariant>) => void;
  onRemove: (id: string) => void;
}

function VariantRow({ variant, onUpdate, onRemove }: VariantRowProps) {
  const size = variant.size ?? variant.variant_value;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background p-2.5 sm:grid-cols-[110px_1fr_1fr_auto_auto] sm:items-center">
      <div className="space-y-1">
        <label
          htmlFor={`size-${variant.id}`}
          className="text-[11px] font-medium text-muted-foreground sm:sr-only"
        >
          Size
        </label>
        <select
          id={`size-${variant.id}`}
          value={size}
          onChange={(event) =>
            onUpdate(variant.id, {
              size: event.target.value,
              variant_value: event.target.value,
            })
          }
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {!BANGLE_SIZES.some((option) => option.label === size) ? (
            <option value={size}>{size}</option>
          ) : null}
          {BANGLE_SIZES.map((option) => (
            <option key={option.label} value={option.label}>
              {option.label}
              {option.surcharge ? ` (+₹${option.surcharge})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`stock-${variant.id}`}
          className="text-[11px] font-medium text-muted-foreground sm:sr-only"
        >
          Stock
        </label>
        <Input
          id={`stock-${variant.id}`}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={variant.stock_quantity ?? ""}
          onChange={(event) =>
            onUpdate(variant.id, {
              stock_quantity: event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="Untracked"
          className="h-9 tabular-nums"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`price-${variant.id}`}
          className="text-[11px] font-medium text-muted-foreground sm:sr-only"
        >
          Price override
        </label>
        <Input
          id={`price-${variant.id}`}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={variant.price_override ?? ""}
          onChange={(event) =>
            onUpdate(variant.id, {
              price_override: event.target.value === "" ? null : Number(event.target.value),
            })
          }
          placeholder="Base price"
          className="h-9 tabular-nums"
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:pb-2">
        <input
          type="checkbox"
          checked={variant.is_active}
          onChange={(event) => onUpdate(variant.id, { is_active: event.target.checked })}
          className="size-4 rounded border-input accent-primary"
        />
        Active
      </label>

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onRemove(variant.id)}
        aria-label={`Remove size ${size}`}
        className="h-8 justify-self-start p-1.5 text-destructive hover:bg-destructive/5"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
