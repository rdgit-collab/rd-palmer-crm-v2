-- Batch 3: convert goodsservices.manufacture from the original imported
-- manufacture table to the new product_manufacturer table by matching names.

create schema if not exists app_private;

create table if not exists app_private.goodsservices_manufacture_before_product_manufacturer_20260601 as
select
  gs.id,
  gs.manufacture,
  mf.name as manufacture_name,
  now() as backed_up_at
from public.goodsservices gs
left join public.manufacture mf on mf.id::text = gs.manufacture;

with manufacture_mapping as (
  select mf.id::text as old_manufacture_id, pmf.id::text as new_manufacture_id
  from public.manufacture mf
  join public.product_manufacturer pmf on pmf.name = mf.name
),
backup_source as (
  select id, manufacture as old_manufacture_id
  from app_private.goodsservices_manufacture_before_product_manufacturer_20260601
),
updates as (
  select bs.id, mm.new_manufacture_id
  from backup_source bs
  join manufacture_mapping mm on mm.old_manufacture_id = bs.old_manufacture_id
)
update public.goodsservices gs
set
  manufacture = updates.new_manufacture_id,
  updated_at = now()
from updates
where updates.id = gs.id
  and gs.manufacture is distinct from updates.new_manufacture_id;
