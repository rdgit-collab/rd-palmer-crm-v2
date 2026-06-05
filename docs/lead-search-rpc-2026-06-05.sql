-- 2026-06-05
-- Purpose:
-- Move the Manage Leads list/search/pagination work into Supabase.
-- Includes open/closed tab filtering, status/assigned filters, sales-user
-- ownership restriction, whitespace-normalized search, and ranking so close
-- company matches appear above broad matches.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft.

create or replace function public.search_leads(
  p_tab text default 'open',
  p_search text default '',
  p_status_filter text default '',
  p_assigned_filter integer default null,
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_closed_stage_ids text[] default array[]::text[],
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
      coalesce(nullif(trim(p_tab), ''), 'open') as tab_id,
      lower(regexp_replace(coalesce(p_search, ''), '[[:space:]]+', ' ', 'g')) as search_text,
      nullif(trim(coalesce(p_status_filter, '')), '') as status_filter,
      greatest(coalesce(p_limit, 30), 1) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset,
      coalesce(p_closed_stage_ids, array[]::text[]) as closed_stage_ids
  ),
  search_tokens as (
    select token
    from params,
      regexp_split_to_table(params.search_text, '[[:space:]]+') as token
    where token <> ''
  ),
  all_rows as (
    select
      sl.id,
      sl.lead_source,
      sl.status,
      sl.type,
      sl.company_id,
      sl.contact_id,
      sl.company_name,
      sl.industry,
      sl.account_type,
      sl.address1,
      sl.address2,
      sl.country,
      sl.state,
      sl.city,
      sl.zipcode,
      sl.office_number,
      sl.mobile_number,
      sl.email,
      sl.website,
      sl.salutation,
      sl.first_name,
      sl.last_name,
      sl.position,
      sl.department_id,
      sl.contact_mobile_number,
      sl.contact_email,
      sl.assigned_to,
      sl.created_at,
      sl.updated_at,
      lower(regexp_replace(coalesce(sl.company_name, ''), '[[:space:]]+', ' ', 'g')) as company_search,
      lower(regexp_replace(concat_ws(' ',
        sl.company_name,
        sl.first_name,
        sl.last_name,
        sl.email,
        sl.contact_email,
        sl.mobile_number,
        sl.contact_mobile_number,
        sl.office_number,
        sl.city,
        sl.state,
        sl.country
      ), '[[:space:]]+', ' ', 'g')) as search_blob
    from public.sales_lead sl
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
      (not coalesce(p_restricted, false) or all_rows.assigned_to = p_current_user_id)
      and (params.status_filter is null or all_rows.status = params.status_filter)
      and (p_assigned_filter is null or all_rows.assigned_to = p_assigned_filter)
      and (
        (
          params.tab_id = 'closed'
          and array_length(params.closed_stage_ids, 1) is not null
          and all_rows.status = any(params.closed_stage_ids)
        )
        or (
          params.tab_id <> 'closed'
          and (
            array_length(params.closed_stage_ids, 1) is null
            or all_rows.status is null
            or not (all_rows.status = any(params.closed_stage_ids))
          )
        )
      )
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
      'lead_source', page_rows.lead_source,
      'status', page_rows.status,
      'type', page_rows.type,
      'company_id', page_rows.company_id,
      'contact_id', page_rows.contact_id,
      'company_name', page_rows.company_name,
      'industry', page_rows.industry,
      'account_type', page_rows.account_type,
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
      'salutation', page_rows.salutation,
      'first_name', page_rows.first_name,
      'last_name', page_rows.last_name,
      'position', page_rows.position,
      'department_id', page_rows.department_id,
      'contact_mobile_number', page_rows.contact_mobile_number,
      'contact_email', page_rows.contact_email,
      'assigned_to', page_rows.assigned_to,
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

grant execute on function public.search_leads(text, text, text, integer, integer, boolean, text[], integer, integer) to authenticated;
