-- RD Palmer CRM legacy data audit
-- Date: 2026-06-01
--
-- Run this after imports, lookup edits, or migration work to catch silent id
-- drift between old Laravel integer ids and new Supabase/frontend lookup ids.

-- ---------------------------------------------------------------------------
-- 1. Legacy user reference audit
-- ---------------------------------------------------------------------------

with legacy as (
  select old_user_id from public.legacy_users where old_user_id is not null
), checks as (
  select 'sales_lead.assigned_to' as field, count(*) filter (where assigned_to is not null) as populated, count(*) filter (where assigned_to is not null and not exists (select 1 from legacy where old_user_id = sales_lead.assigned_to)) as mismatched from public.sales_lead
  union all select 'customer.assignto', count(*) filter (where assignto is not null), count(*) filter (where assignto is not null and not exists (select 1 from legacy where old_user_id = customer.assignto)) from public.customer
  union all select 'customer.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = customer.user_id)) from public.customer
  union all select 'contact.assigned_to', count(*) filter (where assigned_to is not null), count(*) filter (where assigned_to is not null and not exists (select 1 from legacy where old_user_id = contact.assigned_to)) from public.contact
  union all select 'contact.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = contact.user_id)) from public.contact
  union all select 'activity.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = activity.user_id)) from public.activity
  union all select 'quotation.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = quotation.user_id)) from public.quotation
  union all select 'quotation_item.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = quotation_item.user_id)) from public.quotation_item
  union all select 'invoice.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = invoice.user_id)) from public.invoice
  union all select 'invoice_item.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = invoice_item.user_id)) from public.invoice_item
  union all select 'ticket.assigned_to', count(*) filter (where assigned_to is not null), count(*) filter (where assigned_to is not null and not exists (select 1 from legacy where old_user_id = ticket.assigned_to)) from public.ticket
  union all select 'task.assigned_to', count(*) filter (where assigned_to is not null), count(*) filter (where assigned_to is not null and not exists (select 1 from legacy where old_user_id = task.assigned_to)) from public.task
  union all select 'onsiteticket.assigned_to', count(*) filter (where assigned_to is not null), count(*) filter (where assigned_to is not null and not exists (select 1 from legacy where old_user_id = onsiteticket.assigned_to)) from public.onsiteticket
  union all select 'calibration.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = calibration.user_id)) from public.calibration
  union all select 'serialnumber.user_id', count(*) filter (where user_id is not null), count(*) filter (where user_id is not null and not exists (select 1 from legacy where old_user_id = serialnumber.user_id)) from public.serialnumber
)
select * from checks order by mismatched desc, field;

-- ---------------------------------------------------------------------------
-- 2. Catalogue lookup reference audit
-- ---------------------------------------------------------------------------

with checks as (
  select 'goodsservices.category -> product_category.id' as field,
         count(*) filter (where category is not null and category <> '') as populated,
         count(*) filter (where category is not null and category <> '' and category ~ '^[0-9]+$' and not exists (select 1 from public.product_category pc where pc.id = goodsservices.category::bigint)) as numeric_orphans,
         count(*) filter (where category is not null and category <> '' and category !~ '^[0-9]+$') as non_numeric
  from public.goodsservices
  union all
  select 'goodsservices.model -> model.id', count(*) filter (where model is not null and model <> ''), count(*) filter (where model is not null and model <> '' and model ~ '^[0-9]+$' and not exists (select 1 from public.model m where m.id = goodsservices.model::bigint)), count(*) filter (where model is not null and model <> '' and model !~ '^[0-9]+$') from public.goodsservices
  union all
  select 'goodsservices.manufacture -> manufacture.id', count(*) filter (where manufacture is not null and manufacture <> ''), count(*) filter (where manufacture is not null and manufacture <> '' and manufacture ~ '^[0-9]+$' and not exists (select 1 from public.manufacture m where m.id = goodsservices.manufacture::bigint)), count(*) filter (where manufacture is not null and manufacture <> '' and manufacture !~ '^[0-9]+$') from public.goodsservices
  union all
  select 'goodsservices.item_type -> item_type.id', count(*) filter (where item_type is not null and item_type <> ''), count(*) filter (where item_type is not null and item_type <> '' and item_type ~ '^[0-9]+$' and not exists (select 1 from public.item_type it where it.id = goodsservices.item_type::bigint)), count(*) filter (where item_type is not null and item_type <> '' and item_type !~ '^[0-9]+$') from public.goodsservices
  union all
  select 'goodsservices.tax -> tax.id', count(*) filter (where tax is not null and tax <> ''), count(*) filter (where tax is not null and tax <> '' and tax ~ '^[0-9]+$' and not exists (select 1 from public.tax t where t.id = goodsservices.tax::bigint)), count(*) filter (where tax is not null and tax <> '' and tax !~ '^[0-9]+$') from public.goodsservices
)
select * from checks order by field;

-- ---------------------------------------------------------------------------
-- 3. Parent-child orphan audit
-- ---------------------------------------------------------------------------

with checks as (
  select 'quotation_item.qid -> quotation.id' as field, count(*) as rows, count(*) filter (where qid is null) as null_ref, count(*) filter (where qid is not null and not exists (select 1 from public.quotation q where q.id = quotation_item.qid)) as orphan_ref from public.quotation_item
  union all select 'invoice_item.invoiceid -> invoice.id', count(*), count(*) filter (where invoiceid is null), count(*) filter (where invoiceid is not null and not exists (select 1 from public.invoice i where i.id = invoice_item.invoiceid)) from public.invoice_item
  union all select 'task.ticket_id -> ticket.id', count(*), count(*) filter (where ticket_id is null), count(*) filter (where ticket_id is not null and not exists (select 1 from public.ticket t where t.id = task.ticket_id)) from public.task
  union all select 'ticket_product.ticket_id -> ticket.id', count(*), count(*) filter (where ticket_id is null), count(*) filter (where ticket_id is not null and not exists (select 1 from public.ticket t where t.id = ticket_product.ticket_id)) from public.ticket_product
  union all select 'ticket_remark.ticket_id -> ticket.id', count(*), count(*) filter (where ticket_id is null), count(*) filter (where ticket_id is not null and not exists (select 1 from public.ticket t where t.id = ticket_remark.ticket_id)) from public.ticket_remark
  union all select 'calibration_checklist.cid -> calibration.id', count(*), count(*) filter (where cid is null), count(*) filter (where cid is not null and not exists (select 1 from public.calibration c where c.id = calibration_checklist.cid)) from public.calibration_checklist
)
select * from checks order by orphan_ref desc, null_ref desc, field;
