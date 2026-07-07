-- =====================================================================
-- Water Dep role (role_id = 5)
--
-- Water Dep behaves like Sales in the UI, but record visibility is scoped
-- to the whole Water Dep team instead of a single user. Members can view
-- and work on each other's leads, activities, quotations and invoices, and
-- can assign leads/activities to each other.
--
-- This migration:
--   1. Seeds the role lookup row and the Water Dep module permissions.
--   2. Extends the four sales/service search RPCs with an optional
--      p_team_ids integer[] parameter. When supplied, the "restricted"
--      filter matches any id in the team instead of a single current user.
--
-- NOTE: quotation/invoice RLS tightening for direct-by-id access is handled
-- separately — see docs/water-dep-rls-followup-2026-07-07.sql. Without it the
-- team-scoped behaviour still holds for every list/screen in the app (the
-- search RPCs below drive those), but a Water Dep user could in theory read a
-- non-team quotation/invoice by direct id. Apply the RLS follow-up to close
-- that gap.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Role lookup + module permissions
-- ---------------------------------------------------------------------

-- The React app keys off users.role_id, but keep a lookup row for DB reviews
-- (mirrors how Super Admin was seeded).
insert into public.role (id, user_id, role_name, created_at, updated_at)
values (5, 1, 'Water Dep', now(), now())
on conflict (id) do update
set role_name = excluded.role_name,
    updated_at = now();

select setval(
  pg_get_serial_sequence('public.role', 'id'),
  greatest((select max(id) from public.role), 5),
  true
);

-- Grant Water Dep the same sales module set. Admins can fine-tune later in
-- Settings → Role Permissions.
insert into public.module_permission (role_id, module, can_access)
values
  (5, 'customers', true),
  (5, 'contacts', true),
  (5, 'leads', true),
  (5, 'activities', true),
  (5, 'quotations', true),
  (5, 'invoices', true),
  (5, 'tickets', true),
  (5, 'tasks', true),
  (5, 'booking', true),
  (5, 'training', true)
on conflict (role_id, module) do update
set can_access = excluded.can_access;

-- ---------------------------------------------------------------------
-- 2. Search RPCs — add optional p_team_ids team scope
-- ---------------------------------------------------------------------
-- Adding a parameter changes the function signature, so drop the old ones
-- first to avoid ambiguous overloads.

drop function if exists public.search_quotations(text, integer, boolean, integer, integer);
drop function if exists public.search_invoices(text, integer, boolean, integer, integer);
drop function if exists public.search_leads(text, text, text, integer, integer, boolean, text[], integer, integer);
drop function if exists public.search_activities(text, text, text, text, integer, boolean, integer, integer, date, date);

-- ---- search_quotations -------------------------------------------------
create or replace function public.search_quotations(
  p_search text default '',
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_limit integer default 30,
  p_offset integer default 0,
  p_team_ids integer[] default null
)
returns table (rows jsonb, total_count bigint)
language sql
stable
set search_path = ''
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
      (
        case
          when p_team_ids is not null then all_rows.user_id = any(p_team_ids)
          when coalesce(p_restricted, false) then all_rows.user_id = p_current_user_id
          else true
        end
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

grant execute on function public.search_quotations(text, integer, boolean, integer, integer, integer[]) to authenticated;

-- ---- search_invoices ---------------------------------------------------
create or replace function public.search_invoices(
  p_search text default '',
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_limit integer default 30,
  p_offset integer default 0,
  p_team_ids integer[] default null
)
returns table (rows jsonb, total_count bigint)
language sql
stable
set search_path = ''
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
      (
        case
          when p_team_ids is not null then all_rows.user_id = any(p_team_ids)
          when coalesce(p_restricted, false) then all_rows.user_id = p_current_user_id
          else true
        end
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

grant execute on function public.search_invoices(text, integer, boolean, integer, integer, integer[]) to authenticated;

-- ---- search_leads ------------------------------------------------------
create or replace function public.search_leads(
  p_tab text default 'open',
  p_search text default '',
  p_status_filter text default '',
  p_assigned_filter integer default null,
  p_current_user_id integer default null,
  p_restricted boolean default false,
  p_closed_stage_ids text[] default array[]::text[],
  p_limit integer default 30,
  p_offset integer default 0,
  p_team_ids integer[] default null
)
returns table (
  rows jsonb,
  total_count bigint
)
language sql
stable
set search_path = ''
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
      (
        case
          when p_team_ids is not null then all_rows.assigned_to = any(p_team_ids)
          when coalesce(p_restricted, false) then all_rows.assigned_to = p_current_user_id
          else true
        end
      )
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

grant execute on function public.search_leads(text, text, text, integer, integer, boolean, text[], integer, integer, integer[]) to authenticated;

-- ---- search_activities -------------------------------------------------
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
  p_tomorrow date default current_date + 1,
  p_team_ids integer[] default null
)
returns table (
  rows jsonb,
  total_count bigint,
  tab_counts jsonb
)
language sql
stable
set search_path = ''
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
      (
        case
          when p_team_ids is not null then (
            all_rows.assigned_to = any(p_team_ids::text[])
            or all_rows.user_id = any(p_team_ids)
            or all_rows.lead_assigned_to = any(p_team_ids)
          )
          when coalesce(p_restricted, false) then (
            all_rows.assigned_to = p_current_user_id::text
            or all_rows.user_id = p_current_user_id
            or all_rows.lead_assigned_to = p_current_user_id
          )
          else true
        end
      )
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

grant execute on function public.search_activities(text, text, text, text, integer, boolean, integer, integer, date, date, integer[]) to authenticated;
