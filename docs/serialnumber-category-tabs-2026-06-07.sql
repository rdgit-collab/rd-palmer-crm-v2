-- Serial number category tabs support.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-07.
--
-- Serial records are not physically split. Category is resolved safely by:
-- serialnumber.sku -> goodsservices.sku -> goodsservices.category -> category.name.
--
-- If a SKU is missing from catalogue, or maps to more than one category, it is
-- not guessed. It appears under the frontend "Unmatched SKU" tab for cleanup.

create or replace view public.serialnumber_with_category
with (security_invoker = true) as
with sku_category as (
  select
    sku,
    case when count(distinct category) = 1 then max(category) else null end as category_id,
    count(*) as catalogue_rows,
    count(distinct category) as category_count
  from public.goodsservices
  where sku is not null and btrim(sku) <> ''
  group by sku
)
select
  sn.id,
  sn.user_id,
  sn.date,
  sn.ref_number,
  sn.customername,
  sn.sku,
  sn.serial_number,
  sn.warranty_period,
  sn.created_at,
  sn.updated_at,
  sc.category_id,
  c.name as category_name,
  case
    when sc.sku is null then 'unmatched'
    when sc.category_count = 1 and sc.category_id is not null then 'matched'
    else 'ambiguous'
  end as category_status
from public.serialnumber sn
left join sku_category sc on sc.sku = sn.sku
left join public.category c on c.id::text = sc.category_id::text;
