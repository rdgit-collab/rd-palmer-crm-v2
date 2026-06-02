-- RD Palmer CRM task test row cleanup
-- Date: 2026-06-02
--
-- Purpose:
-- Archive and remove task rows identified as development/test data before
-- go-live. This includes the blank-ticket test task and the June 1 TID1331
-- workflow test tasks.

create table if not exists app_private.task_test_rows_archive_20260602 (
  task_id bigint primary key,
  archived_at timestamptz not null default now(),
  reason text not null,
  row_data jsonb not null
);

insert into app_private.task_test_rows_archive_20260602 (task_id, reason, row_data)
select
  task.id,
  case
    when task.id = 4381 then 'Blank ticket test/manual task removed before go-live'
    else 'TID1331 June 1 development/test task removed before go-live'
  end as reason,
  to_jsonb(task) as row_data
from public.task
where task.id in (4381, 4382, 4383, 4384, 4385)
  and (
    (task.id = 4381 and task.ticket_id is null and task.description = 'test')
    or (task.id = 4382 and task.ticket_id = 1231 and task.description = 'Testing task at diagnostic state')
    or (task.id = 4383 and task.ticket_id = 1231 and task.description like 'Assigned task to Azliana to quote%')
    or (task.id = 4384 and task.ticket_id = 1231 and task.description = 'Quotation approved to proceed.')
    or (task.id = 4385 and task.ticket_id = 1231 and task.description = 'Goods ready for delivery and to invoice.')
  )
on conflict (task_id) do nothing;

delete from public.task
where id in (4381, 4382, 4383, 4384, 4385)
  and exists (
    select 1
    from app_private.task_test_rows_archive_20260602 archive
    where archive.task_id = public.task.id
  );
