-- Restore catalogue lookup ids after the earlier product_* normalization was
-- applied twice. This returns goodsservices category/model/manufacture to the
-- original imported lookup tables used by the Catalogue screen.

create schema if not exists app_private;

create table if not exists app_private.goodsservices_lookup_restore_backup_20260601 as
select
  id,
  category,
  model,
  manufacture,
  item_type,
  tax,
  now() as backed_up_at
from public.goodsservices;

with restored as (
  select
    gs.id,
    c2.id::text as category,
    m2.id::text as model,
    mf2.id::text as manufacture
  from public.goodsservices gs
  left join public.product_category pc1 on pc1.id::text = gs.category
  left join public.category c1 on c1.name = pc1.name
  left join public.product_category pc2 on pc2.id::text = c1.id::text
  left join public.category c2 on c2.name = pc2.name
  left join public.product_model pm1 on pm1.id::text = gs.model
  left join public.model m1 on m1.name = pm1.name
  left join public.product_model pm2 on pm2.id::text = m1.id::text
  left join public.model m2 on m2.name = pm2.name
  left join public.product_manufacturer pmf1 on pmf1.id::text = gs.manufacture
  left join public.manufacture mf1 on mf1.name = pmf1.name
  left join public.product_manufacturer pmf2 on pmf2.id::text = mf1.id::text
  left join public.manufacture mf2 on mf2.name = pmf2.name
)
update public.goodsservices gs
set
  category = coalesce(restored.category, gs.category),
  model = coalesce(restored.model, gs.model),
  manufacture = coalesce(restored.manufacture, gs.manufacture),
  updated_at = now()
from restored
where restored.id = gs.id
  and (
    gs.category is distinct from coalesce(restored.category, gs.category)
    or gs.model is distinct from coalesce(restored.model, gs.model)
    or gs.manufacture is distinct from coalesce(restored.manufacture, gs.manufacture)
  );
