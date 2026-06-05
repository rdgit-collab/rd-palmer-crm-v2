-- 2026-06-05
-- Purpose:
-- Move the Activities module list/search/tab-count workload into Supabase so the
-- frontend does not need separate activity, customer, lead, and count queries.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft.

create or replace function public.search_activities(
  p_tab text default 'open',
  p_search text default '',
  p_type_filter text default '',
  p_assigned_filter text default '',
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_limit integer default 30,
  p_offset integer default 0,
  p_today date default current_date,
  p_tomorrow date default current_date + 1
)
returns table (
  rows jsonb,
  total_count bigint,
  tab_counts jsonb
)
language sql
stable
as $$
  with params as (
    select
      coalesce(nullif(trim(p_tab), ''), 'open') as tab_id,
      lower(regexp_replace(coalesce(p_search, ''), '[[:space:]]+', ' ', 'g')) as search_text,
      nullif(trim(coalesce(p_type_filter, '')), '') as type_filter,
      nullif(trim(coalesce(p_assigned_filter, '')), '') as assigned_filter,
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
      a.id,
      a.type,
      a.priority,
      a.status,
      a.date,
      a.time,
      a.description,
      a.lead_id,
      a.company_id,
      a.assigned_to,
      a.user_id,
      a.created_at,
      a.updated_at,
      sl.id as lead_row_id,
      sl.company_name as lead_company_name,
      sl.first_name as lead_first_name,
      sl.last_name as lead_last_name,
      sl.assigned_to as lead_assigned_to,
      sl.status as lead_status,
      cu.id as customer_row_id,
      cu.company_name as customer_company_name,
      coalesce(nullif(sl.company_name, ''), nullif(cu.company_name, ''), nullif(a.company_id, ''), '-') as company_name,
      coalesce(nullif(a.assigned_to, ''), sl.assigned_to::text, '') as assigned_to_display,
      (
        a.status ilike '%complete%'
        or a.status ilike '%cancel%'
        or a.status ilike '%close%'
      ) as is_terminal,
      lower(regexp_replace(concat_ws(' ',
        a.type,
        a.status,
        a.priority,
        a.description,
        sl.company_name,
        cu.company_name,
        a.company_id
      ), '[[:space:]]+', ' ', 'g')) as search_blob
    from public.activity a
    left join public.sales_lead sl on sl.id = a.lead_id
    left join public.customer cu on cu.id::text = a.company_id
  ),
  counted_base as (
    select all_rows.*
    from all_rows
    cross join params
    where
      (not coalesce(p_restricted, false)
        or all_rows.assigned_to = p_current_user_id::text
        or all_rows.user_id = p_current_user_id
        or all_rows.lead_assigned_to = p_current_user_id)
      and (params.type_filter is null or all_rows.type = params.type_filter)
      and (params.assigned_filter is null or all_rows.assigned_to_display = params.assigned_filter)
      and (
        params.search_text = ''
        or not exists (
          select 1
          from search_tokens st
          where all_rows.search_blob not ilike '%' || st.token || '%'
        )
      )
  ),
  filtered as (
    select counted_base.*
    from counted_base
    cross join params
    where
      params.tab_id = 'all'
      or (params.tab_id = 'completed' and counted_base.is_terminal)
      or (params.tab_id = 'open' and not counted_base.is_terminal)
      or (params.tab_id = 'today' and not counted_base.is_terminal and counted_base.date = p_today)
      or (params.tab_id = 'tomorrow' and not counted_base.is_terminal and counted_base.date = p_tomorrow)
      or (params.tab_id = 'overdue' and not counted_base.is_terminal and counted_base.date < p_today)
      or (params.tab_id = 'upcoming' and not counted_base.is_terminal and counted_base.date > p_tomorrow)
  ),
  page_rows as (
    select filtered.*
    from filtered
    cross join params
    order by
      case when params.tab_id = 'overdue' then filtered.date end asc nulls last,
      case when params.tab_id <> 'overdue' then filtered.date end desc nulls last,
      filtered.id desc
    limit (select row_limit from params)
    offset (select row_offset from params)
  ),
  row_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', page_rows.id,
      'type', page_rows.type,
      'priority', page_rows.priority,
      'status', page_rows.status,
      'date', page_rows.date,
      'time', page_rows.time,
      'description', page_rows.description,
      'lead_id', page_rows.lead_id,
      'company_id', page_rows.company_id,
      'assigned_to', page_rows.assigned_to,
      'user_id', page_rows.user_id,
      'created_at', page_rows.created_at,
      'updated_at', page_rows.updated_at,
      'lead', case when page_rows.lead_row_id is null then null else jsonb_build_object(
        'id', page_rows.lead_row_id,
        'company_name', page_rows.lead_company_name,
        'first_name', page_rows.lead_first_name,
        'last_name', page_rows.lead_last_name,
        'assigned_to', page_rows.lead_assigned_to,
        'status', page_rows.lead_status
      ) end,
      'customer', case when page_rows.customer_row_id is null then null else jsonb_build_object(
        'id', page_rows.customer_row_id,
        'company_name', page_rows.customer_company_name
      ) end,
      'companyName', page_rows.company_name,
      'assignedTo', page_rows.assigned_to_display
    ) order by
      case when (select tab_id from params) = 'overdue' then page_rows.date end asc nulls last,
      case when (select tab_id from params) <> 'overdue' then page_rows.date end desc nulls last,
      page_rows.id desc), '[]'::jsonb) as rows
    from page_rows
  ),
  totals as (
    select count(*)::bigint as total_count from filtered
  ),
  counts as (
    select jsonb_build_object(
      'open', count(*) filter (where not is_terminal),
      'today', count(*) filter (where not is_terminal and date = p_today),
      'tomorrow', count(*) filter (where not is_terminal and date = p_tomorrow),
      'upcoming', count(*) filter (where not is_terminal and date > p_tomorrow),
      'overdue', count(*) filter (where not is_terminal and date < p_today),
      'completed', count(*) filter (where is_terminal),
      'all', count(*)
    ) as tab_counts
    from counted_base
  )
  select row_json.rows, totals.total_count, counts.tab_counts
  from row_json, totals, counts;
$$;

grant execute on function public.search_activities(text, text, text, text, integer, boolean, integer, integer, date, date) to authenticated;
