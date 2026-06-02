-- RD Palmer CRM remaining orphan child archive
-- Date: 2026-06-02
--
-- Purpose:
-- Archive and remove child/detail rows whose parent record is missing and
-- where no safe one-to-one alternate parent match exists in Supabase.

create table if not exists app_private.parent_child_orphan_archive_20260602 (
  table_name text not null,
  child_id bigint not null,
  parent_field text not null,
  parent_ref text,
  archived_at timestamptz not null default now(),
  reason text not null,
  row_data jsonb not null,
  primary key (table_name, child_id)
);

insert into app_private.parent_child_orphan_archive_20260602 (
  table_name,
  child_id,
  parent_field,
  parent_ref,
  reason,
  row_data
)
select
  'ticket_product',
  tp.id,
  'ticket_id',
  tp.ticket_id::text,
  'ticket_product row references a missing public.ticket.id and has no safe alternate parent match',
  to_jsonb(tp)
from public.ticket_product tp
where tp.ticket_id is not null
  and not exists (select 1 from public.ticket t where t.id = tp.ticket_id)
union all
select
  'quotation_item',
  qi.id,
  'qid',
  qi.qid::text,
  'quotation_item row references a missing public.quotation.id and has no safe alternate parent match',
  to_jsonb(qi)
from public.quotation_item qi
where qi.qid is not null
  and not exists (select 1 from public.quotation q where q.id = qi.qid)
union all
select
  'invoice_item',
  ii.id,
  'invoiceid',
  ii.invoiceid::text,
  'invoice_item row references a missing public.invoice.id and has no safe alternate parent match',
  to_jsonb(ii)
from public.invoice_item ii
where ii.invoiceid is not null
  and not exists (select 1 from public.invoice i where i.id = ii.invoiceid)
union all
select
  'calibration_checklist',
  cc.id,
  'cid',
  cc.cid::text,
  'calibration_checklist row references a missing public.calibration.id and has no safe alternate parent match',
  to_jsonb(cc)
from public.calibration_checklist cc
where cc.cid is not null
  and not exists (select 1 from public.calibration c where c.id = cc.cid)
on conflict (table_name, child_id) do nothing;

delete from public.ticket_product tp
where exists (
  select 1
  from app_private.parent_child_orphan_archive_20260602 archive
  where archive.table_name = 'ticket_product'
    and archive.child_id = tp.id
);

delete from public.quotation_item qi
where exists (
  select 1
  from app_private.parent_child_orphan_archive_20260602 archive
  where archive.table_name = 'quotation_item'
    and archive.child_id = qi.id
);

delete from public.invoice_item ii
where exists (
  select 1
  from app_private.parent_child_orphan_archive_20260602 archive
  where archive.table_name = 'invoice_item'
    and archive.child_id = ii.id
);

delete from public.calibration_checklist cc
where exists (
  select 1
  from app_private.parent_child_orphan_archive_20260602 archive
  where archive.table_name = 'calibration_checklist'
    and archive.child_id = cc.id
);
