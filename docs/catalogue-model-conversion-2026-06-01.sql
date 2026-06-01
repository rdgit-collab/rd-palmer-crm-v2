-- Batch 2: convert goodsservices.model from the original imported model table
-- to the new product_model table by matching names.
--
-- This intentionally changes only model. Manufacturer remains on the original
-- imported lookup table until its own reviewed batch.

create schema if not exists app_private;

create table if not exists app_private.goodsservices_model_before_product_model_20260601 as
select
  gs.id,
  gs.model,
  m.name as model_name,
  now() as backed_up_at
from public.goodsservices gs
left join public.model m on m.id::text = gs.model;

with model_mapping as (
  select m.id::text as old_model_id, pm.id::text as new_model_id
  from public.model m
  join public.product_model pm on pm.name = m.name
),
backup_source as (
  select id, model as old_model_id
  from app_private.goodsservices_model_before_product_model_20260601
),
updates as (
  select bs.id, mm.new_model_id
  from backup_source bs
  join model_mapping mm on mm.old_model_id = bs.old_model_id
)
update public.goodsservices gs
set
  model = updates.new_model_id,
  updated_at = now()
from updates
where updates.id = gs.id
  and gs.model is distinct from updates.new_model_id;
