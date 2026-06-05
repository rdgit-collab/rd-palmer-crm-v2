-- RD Palmer CRM contact search RPC
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-05.
--
-- Purpose:
-- Move Contact module list searching into one database-side query that joins
-- contact + customer, replacing the frontend two-step "find customer ids, then
-- find contacts" flow.

create or replace function public.search_contacts(
  p_search text default '',
  p_search_field text default 'name',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id bigint,
  company_id integer,
  "Salutation" text,
  first_name text,
  last_name text,
  department_id text,
  "position" text,
  mobile_number text,
  email text,
  address text,
  user_id integer,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  company_name text,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with params as (
    select
      trim(coalesce(p_search, '')) as term,
      lower(coalesce(nullif(trim(p_search_field), ''), 'name')) as field_name,
      greatest(coalesce(p_limit, 30), 1) as row_limit,
      greatest(coalesce(p_offset, 0), 0) as row_offset
  ), base as (
    select
      ct.id,
      ct.company_id,
      ct."Salutation"::text as "Salutation",
      ct.first_name::text as first_name,
      ct.last_name::text as last_name,
      ct.department_id::text as department_id,
      ct.position::text as "position",
      ct.mobile_number::text as mobile_number,
      ct.email::text as email,
      ct.address::text as address,
      ct.user_id,
      ct.created_at,
      ct.updated_at,
      cu.company_name::text as company_name,
      p.term,
      p.field_name,
      case
        when p.field_name = 'company' then lower(regexp_replace(coalesce(cu.company_name, ''), '[[:space:]]+', ' ', 'g'))
        else lower(regexp_replace(concat_ws(' ', ct.first_name, ct.last_name, ct.email, ct.mobile_number, ct.department_id, ct.position, ct.id::text), '[[:space:]]+', ' ', 'g'))
      end as search_text
    from contact ct
    left join customer cu on cu.id = ct.company_id
    cross join params p
  ), filtered as (
    select
      base.*,
      case
        when base.term = '' then 0
        else
          case when base.search_text = lower(regexp_replace(base.term, '[[:space:]]+', ' ', 'g')) then 10000 else 0 end +
          case when base.search_text like lower(regexp_replace(base.term, '[[:space:]]+', ' ', 'g')) || '%' then 7000 else 0 end +
          case when base.search_text like '%' || lower(regexp_replace(base.term, '[[:space:]]+', ' ', 'g')) || '%' then 4000 else 0 end +
          coalesce((
            select sum(1000 - least(nullif(strpos(base.search_text, lower(token)), 0), 999))
            from regexp_split_to_table(base.term, '[[:space:]]+') token
            where base.search_text ilike '%' || token || '%'
          ), 0)
      end as search_score
    from base
    where
      base.term = ''
      or not exists (
        select 1
        from regexp_split_to_table(base.term, '[[:space:]]+') token
        where base.search_text not ilike '%' || token || '%'
      )
  )
  select
    filtered.id,
    filtered.company_id,
    filtered."Salutation",
    filtered.first_name,
    filtered.last_name,
    filtered.department_id,
    filtered."position",
    filtered.mobile_number,
    filtered.email,
    filtered.address,
    filtered.user_id,
    filtered.created_at,
    filtered.updated_at,
    filtered.company_name,
    count(*) over() as total_count
  from filtered
  cross join params p
  order by
    case when p.term = '' then 0 else filtered.search_score end desc,
    filtered.created_at desc nulls last,
    filtered.id desc
  limit (select row_limit from params)
  offset (select row_offset from params);
$$;

grant execute on function public.search_contacts(text, text, integer, integer) to authenticated;
