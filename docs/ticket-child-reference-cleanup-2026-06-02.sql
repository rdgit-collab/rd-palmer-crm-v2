-- RD Palmer CRM ticket child reference cleanup
-- Date: 2026-06-02
--
-- Purpose:
-- Some migrated ticket child rows stored the old visible ticket number in
-- ticket_id, while the new CRM expects ticket_id to point to public.ticket.id.
-- This batch only repairs rows where that visible ticket number maps to exactly
-- one ticket row.

create table if not exists app_private.ticket_child_visible_id_ref_backup_20260602 (
  table_name text not null,
  child_id bigint not null,
  old_ticket_ref bigint,
  new_ticket_id bigint,
  visible_ticket_id bigint,
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null,
  primary key (table_name, child_id)
);

with orphan_ticket_products as (
  select tp.*
  from public.ticket_product tp
  where tp.ticket_id is not null
    and not exists (select 1 from public.ticket t where t.id = tp.ticket_id)
),
ticket_product_matches as (
  select
    o.id as child_id,
    o.ticket_id as old_ref,
    t.id as new_ticket_id,
    t.ticket_id as visible_ticket_id,
    to_jsonb(o) as row_data,
    count(*) over (partition by o.id) as match_count
  from orphan_ticket_products o
  join public.ticket t on t.ticket_id = o.ticket_id
),
orphan_tasks as (
  select task.*
  from public.task
  where task.ticket_id is not null
    and not exists (select 1 from public.ticket t where t.id = task.ticket_id)
),
task_matches as (
  select
    o.id as child_id,
    o.ticket_id as old_ref,
    t.id as new_ticket_id,
    t.ticket_id as visible_ticket_id,
    to_jsonb(o) as row_data,
    count(*) over (partition by o.id) as match_count
  from orphan_tasks o
  join public.ticket t on t.ticket_id = o.ticket_id
)
insert into app_private.ticket_child_visible_id_ref_backup_20260602 (
  table_name,
  child_id,
  old_ticket_ref,
  new_ticket_id,
  visible_ticket_id,
  row_data
)
select 'ticket_product', child_id, old_ref, new_ticket_id, visible_ticket_id, row_data
from ticket_product_matches
where match_count = 1
union all
select 'task', child_id, old_ref, new_ticket_id, visible_ticket_id, row_data
from task_matches
where match_count = 1
on conflict (table_name, child_id) do nothing;

with orphan_ticket_products as (
  select tp.id, tp.ticket_id
  from public.ticket_product tp
  where tp.ticket_id is not null
    and not exists (select 1 from public.ticket t where t.id = tp.ticket_id)
),
ticket_product_matches as (
  select
    o.id as child_id,
    t.id as new_ticket_id,
    count(*) over (partition by o.id) as match_count
  from orphan_ticket_products o
  join public.ticket t on t.ticket_id = o.ticket_id
)
update public.ticket_product tp
set ticket_id = m.new_ticket_id,
    updated_at = now()
from ticket_product_matches m
where tp.id = m.child_id
  and m.match_count = 1;

with orphan_tasks as (
  select task.id, task.ticket_id
  from public.task
  where task.ticket_id is not null
    and not exists (select 1 from public.ticket t where t.id = task.ticket_id)
),
task_matches as (
  select
    o.id as child_id,
    t.id as new_ticket_id,
    count(*) over (partition by o.id) as match_count
  from orphan_tasks o
  join public.ticket t on t.ticket_id = o.ticket_id
)
update public.task
set ticket_id = m.new_ticket_id,
    updated_at = coalesce(public.task.updated_at, now())
from task_matches m
where public.task.id = m.child_id
  and m.match_count = 1;
