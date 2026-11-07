-- 0023_split_glass_bangles_by_colour.sql
-- Splits every multi-colour Glass Bangles product into one independent product
-- per colour. The storefront, cart, orders and admin all treat each colour as a
-- normal product after this migration.
--
-- Safety:
--   * Fresh databases have no legacy product, so this is a no-op there.
--   * Existing colour products are reused by slug, never duplicated.
--   * Variant rows are moved (not recreated), preserving ids, stock, prices
--     and SKUs so order history and inventory are not reset.
--   * The legacy product is deactivated only after every colour product exists
--     and its variants have been moved. It is never deleted.
--   * Missing variant sizes are created with NULL stock (untracked), so the
--     migration never invents inventory counts.
--
-- Fixed product ids match supabase/seed.sql so a later seed/deploy run updates
-- the same rows instead of creating duplicates.

do $$
declare
  v_category_id uuid;
  v_legacy record;
  v_colour record;
  v_product_id uuid;
  v_existing_id uuid;
  v_slug text;
  v_name text;
  v_sku text;
  v_code text;
  v_colour_slug text;
  v_image_url text;
  v_size text;
  v_unmatched integer;
  v_source record;
  v_target record;
  v_sizes text[] := array['2.2', '2.4', '2.6', '2.8', '2.10'];
begin
  select id into v_category_id
  from public.categories
  where slug = 'glass-bangles';

  if v_category_id is null then
    return;
  end if;

  for v_legacy in
    select p.*
    from public.products p
    where p.category_id = v_category_id
      and (
        p.is_active
        or exists (
          select 1 from public.product_variants existing
          where existing.product_id = p.id
        )
      )
      and (
        select count(distinct canonical)
        from (
          select case
                   when lower(btrim(c)) = 'pista' then 'Pista Green'
                   else btrim(c)
                 end as canonical
          from unnest(coalesce(p.colours, '{}'::text[])) as c
          where btrim(c) <> ''
          union
          select case
                   when lower(btrim(v.colour)) = 'pista' then 'Pista Green'
                   else btrim(v.colour)
                 end
          from public.product_variants v
          where v.product_id = p.id
            and btrim(coalesce(v.colour, '')) <> ''
        ) source_colours
      ) > 1
  loop
    -- Every source colour must exist in the palette; otherwise moving variants
    -- could silently drop a colourway.
    select count(*)
      into v_unmatched
      from (
        select distinct canonical
        from (
          select case
                   when lower(btrim(c)) = 'pista' then 'Pista Green'
                   else btrim(c)
                 end as canonical
          from unnest(coalesce(v_legacy.colours, '{}'::text[])) as c
          where btrim(c) <> ''
          union
          select case
                   when lower(btrim(v.colour)) = 'pista' then 'Pista Green'
                   else btrim(v.colour)
                 end as canonical
          from public.product_variants v
          where v.product_id = v_legacy.id
            and btrim(coalesce(v.colour, '')) <> ''
        ) source_colours
      ) source_colours
      left join public.product_colours pc
        on pc.category_id = v_category_id
       and lower(btrim(pc.name)) = lower(source_colours.canonical)
      where pc.id is null;

    if v_unmatched > 0 then
      raise exception
        'Glass Bangles palette is missing % colour(s) for product %; split aborted.',
        v_unmatched,
        v_legacy.id;
    end if;

    for v_colour in
      select pc.*
      from public.product_colours pc
      join (
        select distinct canonical
        from (
          select case
                   when lower(btrim(c)) = 'pista' then 'Pista Green'
                   else btrim(c)
                 end as canonical
          from unnest(coalesce(v_legacy.colours, '{}'::text[])) as c
          where btrim(c) <> ''
          union
          select case
                   when lower(btrim(v.colour)) = 'pista' then 'Pista Green'
                   else btrim(v.colour)
                 end as canonical
          from public.product_variants v
          where v.product_id = v_legacy.id
            and btrim(coalesce(v.colour, '')) <> ''
        ) source_colours
      ) source_colours
        on lower(btrim(pc.name)) = lower(source_colours.canonical)
      where pc.category_id = v_category_id
      order by pc.sort_order, pc.name
    loop
      v_colour_slug := lower(regexp_replace(v_colour.name, '[^a-zA-Z0-9]+', '-', 'g'));
      v_colour_slug := regexp_replace(v_colour_slug, '^-+|-+$', '', 'g');
      v_slug := v_legacy.slug || '-' || v_colour_slug;
      v_name := v_legacy.name || ' ' || chr(8211) || ' ' || v_colour.name;
      v_image_url := '/images/products/colors/bng-159-' || v_colour_slug || '.jpg';

      v_code := case lower(v_colour.name)
        when 'forest green' then 'FG'
        when 'pista green' then 'PG'
        when 'pink' then 'PK'
        when 'maroon' then 'MR'
        when 'red' then 'RD'
        when 'rust orange' then 'RO'
        when 'orange' then 'OR'
        else upper(substr(regexp_replace(v_colour.name, '[^a-zA-Z0-9]+', '', 'g'), 1, 2))
      end;
      v_sku := case
        when v_legacy.sku is null or btrim(v_legacy.sku) = '' then null
        else v_legacy.sku || '-' || v_code
      end;

      v_product_id := case lower(v_colour.name)
        when 'forest green' then '99140881-21c3-4a97-a2f5-c3e85fad570c'::uuid
        when 'pista green' then '7b8f2fd4-fa6f-4001-89e5-ea69a6d1754c'::uuid
        when 'pink' then '61db78e0-8c3d-420c-b513-6881befdc385'::uuid
        when 'maroon' then 'daf0ea29-2994-4859-b5a4-6df12341709d'::uuid
        when 'red' then 'be3774d5-fcde-4c1f-8f9b-9d05f63e42da'::uuid
        when 'rust orange' then 'f1a03599-48cf-4361-8f5f-11cb45cb2aa2'::uuid
        when 'orange' then 'f1c714bc-1b4d-49c6-9235-349de2dfd1fe'::uuid
        else gen_random_uuid()
      end;

      select id into v_existing_id
      from public.products
      where slug = v_slug
      limit 1;

      if v_existing_id is not null then
        v_product_id := v_existing_id;

        update public.products
           set category_id = v_category_id,
               colours = array[v_colour.name],
               colour_images = jsonb_build_array(
                 jsonb_build_object('colour', v_colour.name, 'image_url', v_image_url)
               ),
               primary_image_url = coalesce(nullif(primary_image_url, ''), v_image_url),
               is_active = true,
               updated_at = timezone('utc', now())
         where id = v_product_id;
      else
        insert into public.products (
          id, category_id, name, slug, description, sku, price, compare_at_price,
          stock_quantity, primary_image_url, colours, colour_images, is_active,
          is_featured, is_new_arrival, seo_title, seo_description, legacy_id,
          legacy_image_source, sort_index
        ) values (
          v_product_id, v_category_id, v_name, v_slug, coalesce(v_legacy.description, ''),
          v_sku, coalesce(v_legacy.price, 0), v_legacy.compare_at_price, null,
          v_image_url, array[v_colour.name],
          jsonb_build_array(
            jsonb_build_object('colour', v_colour.name, 'image_url', v_image_url)
          ),
          true, coalesce(v_legacy.is_featured, false),
          coalesce(v_legacy.is_new_arrival, false), v_legacy.seo_title,
          v_legacy.seo_description, v_legacy.legacy_id,
          v_legacy.legacy_image_source,
          coalesce(v_legacy.sort_index, 0) + coalesce(v_colour.sort_order, 0)
        );
      end if;

      insert into public.category_products (category_id, product_id, sort_order)
      values (
        v_category_id,
        v_product_id,
        coalesce(v_legacy.sort_index, 0) + coalesce(v_colour.sort_order, 0)
      )
      on conflict (category_id, product_id) do update
        set sort_order = excluded.sort_order,
            updated_at = timezone('utc', now());

      update public.product_colours
         set image_url = v_image_url,
             updated_at = timezone('utc', now())
       where id = v_colour.id
         and image_url is distinct from v_image_url;

      for v_source in
        select v.*
        from public.product_variants v
        where v.product_id = v_legacy.id
          and case
                when lower(btrim(v.colour)) = 'pista' then 'Pista Green'
                else btrim(v.colour)
              end = v_colour.name
      loop
        v_size := coalesce(nullif(btrim(v_source.size), ''), v_source.variant_value);

        select * into v_target
        from public.product_variants
        where product_id = v_product_id
          and coalesce(lower(size), lower(variant_value)) = lower(v_size)
        limit 1;

        if v_target.id is not null then
          update public.product_variants
             set stock_quantity = coalesce(stock_quantity, v_source.stock_quantity),
                 price_override = coalesce(price_override, v_source.price_override),
                 sku = coalesce(sku, v_source.sku),
                 updated_at = timezone('utc', now())
           where id = v_target.id;

          update public.product_variants
             set is_active = false,
                 updated_at = timezone('utc', now())
           where id = v_source.id;
        else
          update public.product_variants
             set product_id = v_product_id,
                 colour = v_colour.name,
                 colour_hex = coalesce(v_colour.hex_code, colour_hex),
                 size = v_size,
                 image_url = v_image_url,
                 is_active = true,
                 updated_at = timezone('utc', now())
           where id = v_source.id;
        end if;
      end loop;

      foreach v_size in array v_sizes
      loop
        if not exists (
          select 1
          from public.product_variants
          where product_id = v_product_id
            and coalesce(lower(size), lower(variant_value)) = lower(v_size)
        ) then
          insert into public.product_variants (
            product_id, variant_name, variant_value, size, colour, colour_hex,
            image_url, sku, price_override, stock_quantity, is_active
          ) values (
            v_product_id, 'Size', v_size, v_size, v_colour.name, v_colour.hex_code,
            v_image_url, null, null, null, true
          );
        end if;
      end loop;
    end loop;

    update public.products
       set is_active = false,
           updated_at = timezone('utc', now())
     where id = v_legacy.id;

    delete from public.category_products
     where category_id = v_category_id
       and product_id = v_legacy.id;
  end loop;
end $$;
