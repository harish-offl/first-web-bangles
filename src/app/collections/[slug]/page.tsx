import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/products/product-grid";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonLd } from "@/components/shared/json-ld";
import { ListingPagination } from "@/components/shop/listing-pagination";
import { ShopFilters } from "@/components/shop/shop-filters";
import { Button } from "@/components/ui/button";
import { getCatalog } from "@/lib/data";
import { buildShopParams, parseShopValue, shopValueToFilters } from "@/lib/shop/params";
import { BANGLE_SIZES, isBangleCategory } from "@/lib/product-sizes";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 300;

export async function generateMetadata(
  props: PageProps<"/collections/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const category = await getCatalog().getCategoryBySlug(slug);
  if (!category) return { title: "Collection not found" };

  return {
    title: category.name,
    description:
      category.description ??
      `Shop the ${category.name} collection — handcrafted bangles and accessories from Bangles by Beauty.`,
    alternates: { canonical: `/collections/${category.slug}` },
  };
}

export default async function CollectionPage(props: PageProps<"/collections/[slug]">) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const value = { ...parseShopValue(searchParams), category: "" };
  const page = Math.max(1, Number(searchParams.page) || 1);

  const catalog = getCatalog();
  const category = await catalog.getCategoryBySlug(slug);
  if (!category) notFound();

  const result = await catalog.listProductsByCategory(
    category.id,
    shopValueToFilters(value, page),
  );

  const [priceLow, priceHigh, colours] = await Promise.all([
    catalog.listProductsByCategory(category.id, {
      sort: "price-asc",
      page: 1,
      pageSize: 1,
    }),
    catalog.listProductsByCategory(category.id, {
      sort: "price-desc",
      page: 1,
      pageSize: 1,
    }),
    catalog.getColours(),
  ]);
  const priceFloor = priceLow.items[0]?.price ?? 0;
  const priceCeil = priceHigh.items[0]?.price ?? priceFloor;
  const sizes = isBangleCategory(category.name)
    ? BANGLE_SIZES.map((size) => size.label)
    : [];

  const baseParams = buildShopParams(value).toString();
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Collections", href: "/collections" },
    { label: category.name },
  ];

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={breadcrumbs} />
      <JsonLd data={itemListJsonLd(category.name, result.items)} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />

      <header className="mt-5 max-w-3xl">
        <p className="eyebrow mb-3">Collection</p>
        <h1 className="section-title text-balance">{category.name}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {category.description ??
            `${result.total} handcrafted piece${result.total === 1 ? "" : "s"} in this collection.`}
        </p>
      </header>

      <div className="mt-8">
        <ShopFilters
          pathname={`/collections/${slug}`}
          categories={[]}
          showCategories={false}
          colours={colours}
          sizes={sizes}
          priceFloor={priceFloor}
          priceCeil={priceCeil}
          value={value}
          total={result.total}
        />
      </div>

      <div className="mt-8">
        {result.items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="This collection is being updated. Browse all pieces or message us on WhatsApp for help."
            action={
              <Button render={<Link href="/shop" />} nativeButton={false}>
                Shop all bangles
              </Button>
            }
          />
        ) : (
          <>
            <ProductGrid products={result.items} />
            <ListingPagination
              page={result.page}
              pageCount={result.pageCount}
              basePath={`/collections/${slug}`}
              baseParams={baseParams}
            />
          </>
        )}
      </div>
    </div>
  );
}
