-- 2026-06-05
-- Purpose:
-- Move customer list and customer lookup search into Supabase with server-side
-- pagination, whitespace-normalized token search, and ranking for close company
-- matches. Used by Manage Customers and Add Lead > Existing Company.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft.

create or replace function public.search_customers(
  p_search text default '',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  rows jsonb,
  total_count bigint
)
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
    from params,
      regexp_split_to_table(params.search_text, '[[:space:]]+') as token
    where token <> ''
  ),
  all_rows as (
    select
      c.id,
      c.industry,
      c.account_type,
      c.company_name,
      c.address1,
      c.address2,
      c.country,
      c.state,
      c.city,
      c.zipcode,
      c.office_number,
      c.mobile_number,
      c.email,
      c.website,
      c.assigned,
      c.assignto,
      c.created_at,
      c.updated_at,
      lower(regexp_replace(coalesce(c.company_name, ''), '[[:space:]]+', ' ', 'g')) as company_search,
      lower(regexp_replace(concat_ws(' ',
        c.company_name,
        c.email,
        c.mobile_number,
        c.office_number,
        c.city,
        c.state,
        c.country,
        c.assigned
      ), '[[:space:]]+', ' ', 'g')) as search_blob
    from public.customer c
  ),
  base as (
    select
      all_rows.*,
      case
        when params.search_text = '' then 5
        when all_rows.company_search = params.search_text then 0
        when all_rows.company_search like params.search_text || '%' then 1
        when all_rows.company_search like '%' || params.search_text || '%' then 2
        else 3
      end as search_rank
    from all_rows
    cross join params
    where
      params.search_text = ''
      or not exists (
        select 1
        from search_tokens st
        where all_rows.search_blob not ilike '%' || st.token || '%'
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
      'industry', page_rows.industry,
      'account_type', page_rows.account_type,
      'company_name', page_rows.company_name,
      'address1', page_rows.address1,
      'address2', page_rows.address2,
      'country', page_rows.country,
      'state', page_rows.state,
      'city', page_rows.city,
      'zipcode', page_rows.zipcode,
      'office_number', page_rows.office_number,
      'mobile_number', page_rows.mobile_number,
      'email', page_rows.email,
      'website', page_rows.website,
      'assigned', page_rows.assigned,
      'assignto', page_rows.assignto,
      'created_at', page_rows.created_at,
      'updated_at', page_rows.updated_at
    ) order by
      case when (select search_text from params) <> '' then page_rows.search_rank end asc nulls last,
      page_rows.created_at desc nulls last,
      page_rows.id desc), '[]'::jsonb) as rows
    from page_rows
  ),
  totals as (
    select count(*)::bigint as total_count from base
  )
  select row_json.rows, totals.total_count
  from row_json, totals;
$$;

grant execute on function public.search_customers(text, integer, integer) to authenticated;
