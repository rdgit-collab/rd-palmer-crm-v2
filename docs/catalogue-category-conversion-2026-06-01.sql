-- Batch 1: convert goodsservices.category from the original imported
-- category table to the new product_category table by matching names.
--
-- This intentionally changes only category. Model and manufacturer remain on
-- their original imported lookup tables until their own reviewed batches.

create schema if not exists app_private;

create table if not exists app_private.goodsservices_category_before_product_category_20260601 as
select
  gs.id,
  gs.category,
  c.name as category_name,
  now() as backed_up_at
from public.goodsservices gs
left join public.category c on c.id::text = gs.category;

with category_mapping as (
  select c.id::text as old_category_id, pc.id::text as new_category_id
  from public.category c
  join public.product_category pc on pc.name = c.name
),
backup_source as (
  select id, category as old_category_id
  from app_private.goodsservices_category_before_product_category_20260601
),
updates as (
  select bs.id, cm.new_category_id
  from backup_source bs
  join category_mapping cm on cm.old_category_id = bs.old_category_id
)
update public.goodsservices gs
set
  category = updates.new_category_id,
  updated_at = now()
from updates
where updates.id = gs.id
  and gs.category is distinct from updates.new_category_id;
