-- Include Water Dep (role 5) users in the Salesperson Performance table on the
-- sales dashboard. Only change vs the prior definition: the sales_users role
-- filter is now role_id in (2, 4, 5).
CREATE OR REPLACE FUNCTION public.get_sales_dashboard_summary(p_month text DEFAULT NULL::text, p_current_user_id integer DEFAULT NULL::integer, p_restricted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
with params as (
  select
    coalesce(to_date(nullif(p_month, '') || '-01', 'YYYY-MM-DD'), date_trunc('month', current_date)::date) as selected_start,
    (coalesce(to_date(nullif(p_month, '') || '-01', 'YYYY-MM-DD'), date_trunc('month', current_date)::date) + interval '1 month')::date as selected_end,
    date_trunc('month', current_date)::date as current_start,
    (date_trunc('month', current_date)::date + interval '1 month')::date as current_end,
    (current_date - interval '7 days')::date as stale_date,
    current_date as today
),
sales_users as (
  select
    u.old_user_id::text as id,
    u.old_user_id,
    coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), '-') as name,
    trim(lower(regexp_replace(concat_ws(' ', u.first_name, u.last_name), '[^a-zA-Z0-9]+', ' ', 'g'))) as norm_name,
    trim(lower(regexp_replace(coalesce(u.first_name, '') || ', ' || coalesce(u.last_name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) as norm_comma
  from public.users u
  where u.old_user_id is not null
    and u.role_id in (2, 4, 5)
    and lower(coalesce(u.status, 'active')) <> 'inactive'
),
lead_rows as (
  select
    l.*,
    coalesce(st.name, l.status, 'Open') as status_name
  from public.sales_lead l
  left join public.stage st on st.id::text = l.status
),
scoped_leads as (
  select *
  from lead_rows l
  where (not p_restricted) or l.assigned_to = p_current_user_id
),
open_scoped_leads as (
  select *
  from scoped_leads l
  where not (
    lower(coalesce(l.status_name, '')) like '%closed%'
    or lower(coalesce(l.status_name, '')) in ('won', 'lost', 'complete', 'completed')
  )
),
scoped_activities as (
  select a.*
  from public.activity a
  where (not p_restricted)
     or a.assigned_to = p_current_user_id::text
     or a.user_id = p_current_user_id
     or exists (select 1 from scoped_leads sl where sl.id = a.lead_id)
),
scoped_quotations as (
  select q.*
  from public.quotation q
  where (not p_restricted) or q.user_id = p_current_user_id
),
scoped_invoices as (
  select i.*
  from public.invoice i
  where (not p_restricted) or i.user_id = p_current_user_id
),
owner_quotations as (
  select su.id as staff_id, q.*
  from public.quotation q
  left join lateral (
    select su.*
    from sales_users su
    where su.id = coalesce(q.sales_person, q.user_id::text)
       or su.norm_name = trim(lower(regexp_replace(coalesce(q.sales_person, q.user_id::text), '[^a-zA-Z0-9]+', ' ', 'g')))
       or su.norm_comma = trim(lower(regexp_replace(coalesce(q.sales_person, q.user_id::text), '[^a-zA-Z0-9]+', ' ', 'g')))
    limit 1
  ) su on true
),
owner_invoices as (
  select su.id as staff_id, i.*
  from public.invoice i
  left join lateral (
    select su.*
    from sales_users su
    where su.id = coalesce(i.sales_person, i.user_id::text)
       or su.norm_name = trim(lower(regexp_replace(coalesce(i.sales_person, i.user_id::text), '[^a-zA-Z0-9]+', ' ', 'g')))
       or su.norm_comma = trim(lower(regexp_replace(coalesce(i.sales_person, i.user_id::text), '[^a-zA-Z0-9]+', ' ', 'g')))
    limit 1
  ) su on true
),
sales_metrics as (
  select
    su.id,
    su.name,
    count(l.id) filter (where not (lower(coalesce(l.status_name, '')) like '%closed%' or lower(coalesce(l.status_name, '')) in ('won', 'lost', 'complete', 'completed')))::int as open_leads,
    count(l.id) filter (where lower(coalesce(l.status_name, '')) like '%won%')::int as won_leads,
    count(l.id) filter (where lower(coalesce(l.status_name, '')) like '%lost%')::int as lost_leads,
    (select count(*)::int from public.activity a, params p where a.assigned_to = su.id and coalesce(a.date, a.created_at::date) >= p.selected_start and coalesce(a.date, a.created_at::date) < p.selected_end) as activities,
    (select count(*)::int from owner_quotations oq, params p where oq.staff_id = su.id and oq.date >= p.selected_start and oq.date < p.selected_end) as quotations,
    coalesce((select sum(oq.total)::numeric from owner_quotations oq, params p where oq.staff_id = su.id and oq.date >= p.selected_start and oq.date < p.selected_end), 0) as quotation_value,
    (select count(*)::int from owner_quotations oq, params p where oq.staff_id = su.id and oq.date >= p.selected_start and oq.date < p.selected_end and coalesce(oq.isconvert, 0) = 1) as converted,
    coalesce((select sum(oi.total)::numeric from owner_invoices oi, params p where oi.staff_id = su.id and oi.date >= p.selected_start and oi.date < p.selected_end), 0) as invoice_value
  from sales_users su
  left join lead_rows l on l.assigned_to::text = su.id
  group by su.id, su.name
),
last_activity_by_lead as (
  select a.lead_id, max(coalesce(a.date, a.created_at::date)) as last_activity
  from scoped_activities a
  where a.lead_id is not null
  group by a.lead_id
),
followups as (
  select
    l.id,
    coalesce(nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''), 'Unnamed lead') as name,
    coalesce(l.company_name, '-') as company,
    coalesce(su.name, '-') as owner,
    l.status_name as status,
    coalesce(la.last_activity, l.updated_at::date, l.created_at::date) as last_activity
  from open_scoped_leads l
  left join sales_users su on su.old_user_id = l.assigned_to
  left join last_activity_by_lead la on la.lead_id = l.id
  where coalesce(la.last_activity, l.updated_at::date, l.created_at::date) <= (select stale_date from params)
  order by last_activity asc nulls first
  limit 8
),
stat_counts as (
  select
    (select count(*)::int from public.customer where (not p_restricted) or assignto = p_current_user_id or user_id = p_current_user_id) as customers,
    (select count(*)::int from open_scoped_leads) as leads,
    (select count(*)::int from scoped_leads, params where created_at::date >= params.current_start and created_at::date < params.current_end) as new_leads_this_month,
    (select count(*)::int from scoped_quotations) as quotations,
    (select count(*)::int from scoped_invoices) as invoices,
    (select count(*)::int from scoped_invoices, params where due_date < params.today) as overdue_invoices,
    (select coalesce(sum(total), 0)::numeric from scoped_quotations, params where date >= params.current_start and date < params.current_end) as quote_value_this_month,
    (select coalesce(sum(total), 0)::numeric from scoped_invoices, params where date >= params.current_start and date < params.current_end) as invoice_value_this_month,
    (select count(*)::int from scoped_quotations, params where date >= least(params.selected_start, params.current_start)) as conversion_base,
    (select count(*)::int from scoped_quotations, params where date >= least(params.selected_start, params.current_start) and coalesce(isconvert, 0) = 1) as converted_quotes
)
select jsonb_build_object(
  'stats', jsonb_build_object(
    'customers', sc.customers,
    'leads', sc.leads,
    'newLeadsThisMonth', sc.new_leads_this_month,
    'quotations', sc.quotations,
    'invoices', sc.invoices,
    'overdueInvoices', sc.overdue_invoices,
    'quoteValueThisMonth', sc.quote_value_this_month,
    'invoiceValueThisMonth', sc.invoice_value_this_month,
    'quoteConversion', case when sc.conversion_base > 0 then round((sc.converted_quotes::numeric / sc.conversion_base) * 100)::int else 0 end
  ),
  'salesRows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'openLeads', open_leads,
      'wonLeads', won_leads,
      'lostLeads', lost_leads,
      'activities', activities,
      'quotations', quotations,
      'quotationValue', quotation_value,
      'converted', converted,
      'invoiceValue', invoice_value
    ) order by (invoice_value + quotation_value + open_leads) desc, name asc)
    from sales_metrics
  ), '[]'::jsonb),
  'followUpItems', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'company', company,
      'owner', owner,
      'status', status,
      'lastActivity', last_activity
    ) order by last_activity asc)
    from followups
  ), '[]'::jsonb)
)
from stat_counts sc;
$function$;