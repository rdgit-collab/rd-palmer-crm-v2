-- RD Palmer CRM Technical role ticket customer lookup access
-- Date: 2026-06-02
--
-- Purpose:
-- Technical/service users can create tickets, but ticket creation needs customer
-- and contact lookup access for the customer/contact dropdowns.

insert into public.module_permission (role_id, module, can_access)
values
  (3, 'customers', true),
  (3, 'contacts', true)
on conflict (role_id, module)
do update set can_access = excluded.can_access;
