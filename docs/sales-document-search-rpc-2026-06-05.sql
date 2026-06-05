-- 2026-06-05
-- Purpose:
-- Move quotation and invoice list search/pagination into Supabase. Each RPC
-- returns the list rows, total count, and first visible line item in one call.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft.

create or replace function public.search_quotations(
  p_search text default '',
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (rows jsonb, total_count bigint)
language sql
stable
as $$
  with params as (
    select
      lower(regexp_replace(coalesce(p_search, ''), '[[:space:]]+', ' ', 'g')) as search_text,
      greatest(coalesce(p_limit, 30), 1) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset
  ),
  search_tokens as (
    select token
    from params, regexp_split_to_table(params.search_text, '[[:space:]]+') as token
    where token <> ''
  ),
  all_rows as (
    select
      q.id,
      q.user_id,
      q.number,
      q.name,
      q.date,
      q.expiry_date,
      q.currency,
      q.total,
      q.isconvert,
      q.created_at,
      first_item.item as first_item,
      lower(regexp_replace(coalesce(q.number, ''), '[[:space:]]+', ' ', 'g')) as number_search,
      lower(regexp_replace(coalesce(q.name, ''), '[[:space:]]+', ' ', 'g')) as name_search,
      lower(regexp_replace(concat_ws(' ', q.name, q.number, first_item.item), '[[:space:]]+', ' ', 'g')) as search_blob
    from public.quotation q
    left join lateral (
      select qi.item
      from public.quotation_item qi
      where qi.qid = q.id
      order by qi.id
      limit 1
    ) first_item on true
  ),
  base as (
    select
      all_rows.*,
      case
        when params.search_text = '' then 5
        when all_rows.number_search = params.search_text then 0
        when all_rows.name_search = params.search_text then 1
        when all_rows.number_search like params.search_text || '%' then 2
        when all_rows.name_search like params.search_text || '%' then 3
        when all_rows.name_search like '%' || params.search_text || '%' then 4
        else 6
      end as search_rank
    from all_rows
    cross join params
    where
      (not coalesce(p_restricted, false) or all_rows.user_id = p_current_user_id)
      and (
        params.search_text = ''
        or not exists (
          select 1
          from search_tokens st
          where all_rows.search_blob not ilike '%' || st.token || '%'
        )
      )
  ),
  page_rows as (
    select base.*
    from base
    cross join params
    order by
      case when params.search_text <> '' then base.search_rank end asc nulls last,
      base.created_at desc nulls last,
      base.id desc
    limit (select row_limit from params)
    offset (select row_offset from params)
  ),
  row_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', page_rows.id,
      'user_id', page_rows.user_id,
      'number', page_rows.number,
      'name', page_rows.name,
      'date', page_rows.date,
      'expiry_date', page_rows.expiry_date,
      'currency', page_rows.currency,
      'total', page_rows.total,
      'isconvert', page_rows.isconvert,
      'created_at', page_rows.created_at,
      'first_item', coalesce(page_rows.first_item, '')
    ) order by
      case when (select search_text from params) <> '' then page_rows.search_rank end asc nulls last,
      page_rows.created_at desc nulls last,
      page_rows.id desc), '[]'::jsonb) as rows
    from page_rows
  ),
  totals as (select count(*)::bigint as total_count from base)
  select row_json.rows, totals.total_count from row_json, totals;
$$;

grant execute on function public.search_quotations(text, integer, boolean, integer, integer) to authenticated;

create or replace function public.search_invoices(
  p_search text default '',
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (rows jsonb, total_count bigint)
language sql
stable
as $$
  with params as (
    select
      lower(regexp_replace(coalesce(p_search, ''), '[[:space:]]+', ' ', 'g')) as search_text,
      greatest(coalesce(p_limit, 30), 1) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset
  ),
  search_tokens as (
    select token
    from params, regexp_split_to_table(params.search_text, '[[:space:]]+') as token
    where token <> ''
  ),
  all_rows as (
    select
      inv.id,
      inv.user_id,
      inv.invoice_number,
      inv.name,
      inv.date,
      inv.due_date,
      inv.quote_ref_number,
      inv.currency,
      inv.total,
      inv.created_at,
      first_item.item as first_item,
      lower(regexp_replace(coalesce(inv.invoice_number, ''), '[[:space:]]+', ' ', 'g')) as number_search,
      lower(regexp_replace(coalesce(inv.name, ''), '[[:space:]]+', ' ', 'g')) as name_search,
      lower(regexp_replace(concat_ws(' ', inv.name, inv.invoice_number, inv.quote_ref_number, first_item.item), '[[:space:]]+', ' ', 'g')) as search_blob
    from public.invoice inv
    left join lateral (
      select ii.item
      from public.invoice_item ii
      where ii.invoiceid = inv.id
      order by ii.id
      limit 1
    ) first_item on true
  ),
  base as (
    select
      all_rows.*,
      case
        when params.search_text = '' then 5
        when all_rows.number_search = params.search_text then 0
        when all_rows.name_search = params.search_text then 1
        when all_rows.number_search like params.search_text || '%' then 2
        when all_rows.name_search like params.search_text || '%' then 3
        when all_rows.name_search like '%' || params.search_text || '%' then 4
        else 6
      end as search_rank
    from all_rows
    cross join params
    where
      (not coalesce(p_restricted, false) or all_rows.user_id = p_current_user_id)
      and (
        params.search_text = ''
        or not exists (
          select 1
          from search_tokens st
          where all_rows.search_blob not ilike '%' || st.token || '%'
        )
      )
  ),
  page_rows as (
    select base.*
    from base
    cross join params
    order by
      case when params.search_text <> '' then base.search_rank end asc nulls last,
      base.created_at desc nulls last,
      base.id desc
    limit (select row_limit from params)
    offset (select row_offset from params)
  ),
  row_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', page_rows.id,
      'user_id', page_rows.user_id,
      'invoice_number', page_rows.invoice_number,
      'name', page_rows.name,
      'date', page_rows.date,
      'due_date', page_rows.due_date,
      'quote_ref_number', page_rows.quote_ref_number,
      'currency', page_rows.currency,
      'total', page_rows.total,
      'created_at', page_rows.created_at,
      'first_item', coalesce(page_rows.first_item, '')
    ) order by
      case when (select search_text from params) <> '' then page_rows.search_rank end asc nulls last,
      page_rows.created_at desc nulls last,
      page_rows.id desc), '[]'::jsonb) as rows
    from page_rows
  ),
  totals as (select count(*)::bigint as total_count from base)
  select row_json.rows, totals.total_count from row_json, totals;
$$;

grant execute on function public.search_invoices(text, integer, boolean, integer, integer) to authenticated;
