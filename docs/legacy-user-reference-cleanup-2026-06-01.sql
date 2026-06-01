-- Add a missing inactive legacy-user dictionary entry for old user id 23.
--
-- The affected historical records already had valid assigned staff, but their
-- creator user_id pointed to old user 23, which was missing from legacy_users.
-- Preserving the old id is safer than rewriting historical creator fields.

create schema if not exists app_private;

create table if not exists app_private.legacy_user_23_reference_backup_20260601 as
select 'ticket' as source_table, id::bigint as source_id, user_id::text as user_id, now() as backed_up_at
from public.ticket
where user_id::text = '23'
union all
select 'task', id::bigint, user_id::text, now()
from public.task
where user_id::text = '23'
union all
select 'ticket_product', id::bigint, user_id::text, now()
from public.ticket_product
where user_id::text = '23';

insert into public.legacy_users (
  old_user_id,
  email,
  first_name,
  last_name,
  role_id,
  status,
  position,
  department,
  phone,
  created_at,
  updated_at,
  auth_user_id
)
values (
  23,
  null,
  'Legacy User 23',
  '(Inactive)',
  null,
  '0',
  null,
  null,
  null,
  null,
  now(),
  null
)
on conflict (old_user_id) do nothing;
