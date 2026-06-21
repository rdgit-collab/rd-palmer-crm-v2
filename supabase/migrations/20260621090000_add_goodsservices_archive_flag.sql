alter table public.goodsservices
  add column if not exists is_archived boolean not null default false;

create index if not exists goodsservices_is_archived_category_idx
  on public.goodsservices (is_archived, category);

create index if not exists goodsservices_active_sku_idx
  on public.goodsservices (sku)
  where is_archived = false;

create index if not exists goodsservices_active_name_idx
  on public.goodsservices (name)
  where is_archived = false;
