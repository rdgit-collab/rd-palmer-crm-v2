-- RD Palmer CRM RMA legacy ticket link fix
-- Date: 2026-06-03
--
-- Purpose:
-- Older migrated RMA rows stored the old visible ticket number in rma.ticket_id.
-- The new CRM expects rma.ticket_id to reference public.ticket.id.
--
-- Example before the fix:
--   STN 6236815 stored ticket_id = 816, which displayed as TID916 because
--   ticket row id 816 is visible ticket TID916.
--
-- Example after the fix:
--   STN 6236815 stores ticket_id = 716, which displays as TID816.
--
-- Scope:
--   Fixed old migrated RMA rows id 1 to 25 only.
--   Left final-sync RMA id 26 unchanged because it was already correct.

create table if not exists app_private.rma_legacy_ticket_link_backup_20260603 (
  rma_id bigint primary key,
  rma_number text,
  old_ticket_ref bigint,
  old_displayed_tid bigint,
  new_ticket_id bigint,
  new_displayed_tid bigint,
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null
);

with legacy_rma_matches as (
  select
    r.id as rma_id,
    r.rma_number,
    r.ticket_id as old_ticket_ref,
    current_ticket.ticket_id as old_displayed_tid,
    intended_ticket.id as new_ticket_id,
    intended_ticket.ticket_id as new_displayed_tid,
    to_jsonb(r) as row_data,
    count(*) over (partition by r.id) as match_count
  from public.rma r
  join public.ticket current_ticket on current_ticket.id = r.ticket_id
  join public.ticket intended_ticket on intended_ticket.ticket_id = r.ticket_id
  where r.id < 26
    and current_ticket.ticket_id is distinct from r.ticket_id
)
insert into app_private.rma_legacy_ticket_link_backup_20260603 (
  rma_id,
  rma_number,
  old_ticket_ref,
  old_displayed_tid,
  new_ticket_id,
  new_displayed_tid,
  row_data
)
select
  rma_id,
  rma_number,
  old_ticket_ref,
  old_displayed_tid,
  new_ticket_id,
  new_displayed_tid,
  row_data
from legacy_rma_matches
where match_count = 1
on conflict (rma_id) do nothing;

with legacy_rma_matches as (
  select
    r.id as rma_id,
    intended_ticket.id as new_ticket_id,
    count(*) over (partition by r.id) as match_count
  from public.rma r
  join public.ticket current_ticket on current_ticket.id = r.ticket_id
  join public.ticket intended_ticket on intended_ticket.ticket_id = r.ticket_id
  where r.id < 26
    and current_ticket.ticket_id is distinct from r.ticket_id
)
update public.rma r
set ticket_id = m.new_ticket_id,
    updated_at = coalesce(r.updated_at, now())
from legacy_rma_matches m
where r.id = m.rma_id
  and m.match_count = 1;

-- Verification result after applying:
--   backup rows: 25
--   corrected old RMA rows: 25
--   STN 6236815 now displays TID816
--   STN 6237670 now displays TID880
--   STN 6248237 still displays TID1321
