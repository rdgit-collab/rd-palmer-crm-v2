-- Allow Sales users to view/share training sessions.
-- Training edits remain restricted to Admin/Super Admin by RLS and UI checks.

insert into public.module_permission (role_id, module, can_access)
values (2, 'training', true)
on conflict (role_id, module)
do update set can_access = excluded.can_access;

notify pgrst, 'reload schema';
