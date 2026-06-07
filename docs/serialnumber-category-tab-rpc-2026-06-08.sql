-- Serial number category tab loading optimization.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-08.
--
-- Why:
-- The generic serialnumber_with_category view can be fast for "All", but rare
-- categories may scan many serial rows before finding the latest matching rows.
-- This RPC first materializes the small category SKU list, then fetches matching
-- serial rows through the serialnumber.sku index.

create or replace function public.search_serialnumbers_by_category(
  p_category_id text,
  p_search_field text default 'serial_number',
  p_search_term text default '',
  p_sort_mode text default 'latest',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id bigint,
  date date,
  ref_number text,
  customername text,
  sku text,
  serial_number text,
  warranty_period text,
  category_id text,
  category_name varchar(191),
  category_status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with category_skus as materialized (
    select
      m.sku,
      m.category_id,
      m.category_name,
      m.category_status
    from public.goodsservices_sku_category_map m
    where m.category_id = p_category_id
  ),
  serial_matches as materialized (
    select
      sn.id,
      sn.date,
      sn.ref_number,
      sn.customername,
      sn.sku,
      sn.serial_number,
      sn.warranty_period,
      cs.category_id,
      cs.category_name,
      cs.category_status
    from public.serialnumber sn
    join category_skus cs on cs.sku = sn.sku::text
    where coalesce(btrim(p_search_term), '') = ''
      or case p_search_field
        when 'sku' then sn.sku ilike '%' || p_search_term || '%'
        when 'customername' then sn.customername ilike '%' || p_search_term || '%'
        when 'ref_number' then sn.ref_number ilike '%' || p_search_term || '%'
        else sn.serial_number ilike '%' || p_search_term || '%'
      end
  ),
  counted as (
    select serial_matches.*, count(*) over() as total_count
    from serial_matches
  )
  select
    counted.id,
    counted.date,
    counted.ref_number,
    counted.customername,
    counted.sku,
    counted.serial_number,
    counted.warranty_period,
    counted.category_id,
    counted.category_name,
    counted.category_status,
    counted.total_count
  from counted
  order by
    case when p_sort_mode = 'date_asc' then counted.date end asc nulls last,
    case when p_sort_mode = 'date_desc' then counted.date end desc nulls last,
    counted.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function public.search_serialnumbers_by_category(text, text, text, text, integer, integer) to authenticated;
