-- RD Palmer CRM go-live Supabase hardening draft
-- Date: 2026-05-31
--
-- IMPORTANT:
-- This file is intentionally stored as a reviewed SQL draft. Apply it from the
-- Supabase SQL editor only after checking the current policy names in Supabase.
-- The workspace does not currently include Supabase CLI/migrations or a direct
-- database connection string, so this script has not been applied from Codex.

-- ---------------------------------------------------------------------------
-- 1. Performance indexes for common CRM filters/searches
-- ---------------------------------------------------------------------------

create index if not exists idx_sales_lead_assigned_to on public.sales_lead (assigned_to);
create index if not exists idx_sales_lead_status on public.sales_lead (status);
create index if not exists idx_sales_lead_created_at on public.sales_lead (created_at);

create index if not exists idx_activity_assigned_to on public.activity (assigned_to);
create index if not exists idx_activity_user_id on public.activity (user_id);
create index if not exists idx_activity_lead_id on public.activity (lead_id);
create index if not exists idx_activity_date on public.activity (date);
create index if not exists idx_activity_created_at on public.activity (created_at);

create index if not exists idx_quotation_user_id on public.quotation (user_id);
create index if not exists idx_quotation_number on public.quotation (number);
create index if not exists idx_quotation_date on public.quotation (date);
create index if not exists idx_quotation_created_at on public.quotation (created_at);

create index if not exists idx_quotation_item_qid on public.quotation_item (qid);

create index if not exists idx_invoice_user_id on public.invoice (user_id);
create index if not exists idx_invoice_invoice_number on public.invoice (invoice_number);
create index if not exists idx_invoice_date on public.invoice (date);
create index if not exists idx_invoice_created_at on public.invoice (created_at);

create index if not exists idx_invoice_item_invoiceid on public.invoice_item (invoiceid);

create index if not exists idx_ticket_ticket_id on public.ticket (ticket_id);
create index if not exists idx_ticket_assigned_to on public.ticket (assigned_to);
create index if not exists idx_ticket_is_completed on public.ticket (is_completed);
create index if not exists idx_ticket_due_date on public.ticket (due_date);

create index if not exists idx_task_ticket_id on public.task (ticket_id);
create index if not exists idx_task_assigned_to on public.task (assigned_to);
create index if not exists idx_task_is_completed on public.task (is_completed);
create index if not exists idx_task_enddate on public.task (enddate);

create index if not exists idx_onsiteticket_ticket_id on public.onsiteticket (ticket_id);
create index if not exists idx_onsiteticket_assigned_to on public.onsiteticket (assigned_to);
create index if not exists idx_onsiteticket_is_completed on public.onsiteticket (is_completed);

create index if not exists idx_rma_ticket_id on public.rma (ticket_id);

create index if not exists idx_serialnumber_serial_number on public.serialnumber (serial_number);
create index if not exists idx_serialnumber_sku on public.serialnumber (sku);
create index if not exists idx_serialnumber_customername on public.serialnumber (customername);
create index if not exists idx_serialnumber_ref_number on public.serialnumber (ref_number);

-- Optional fuzzy-search speedups. Enable only if pg_trgm is available/approved.
-- create extension if not exists pg_trgm;
-- create index if not exists idx_customer_company_name_trgm on public.customer using gin (company_name gin_trgm_ops);
-- create index if not exists idx_ticket_company_name_trgm on public.ticket using gin (company_name gin_trgm_ops);
-- create index if not exists idx_serialnumber_serial_number_trgm on public.serialnumber using gin (serial_number gin_trgm_ops);
-- create index if not exists idx_serialnumber_sku_trgm on public.serialnumber using gin (sku gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. RLS review checklist
-- ---------------------------------------------------------------------------
--
-- Before applying restrictive policies, inspect existing policies:
--
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;
--
-- Tables that must be checked before production:
-- - users
-- - module_permission
-- - customer
-- - contact
-- - sales_lead
-- - activity
-- - quotation, quotation_item
-- - invoice, invoice_item
-- - ticket, ticket_product, ticket_remark
-- - task
-- - onsiteticket
-- - rma
-- - calibration, calibration_checklist
-- - serialnumber
-- - goodsservices and catalogue lookup tables
-- - app_setting
--
-- Intended access model:
-- - Admin role_id = 1: all CRM data.
-- - Sales role_id = 2: own sales data, plus ticket access granted by module
--   permission.
-- - Service role_id = 3: service modules only.
-- - Sales Manager role_id = 4: sales workflow access, with Activities All
--   Activity in frontend. Confirm with management whether Sales Manager should
--   see all sales documents in the database or own documents only.
--
-- Do not add new "allow" policies while old broad policies remain if the goal
-- is restriction. In Postgres RLS, permissive policies are OR'ed together.

-- ---------------------------------------------------------------------------
-- 3. Storage policy review checklist
-- ---------------------------------------------------------------------------
--
-- The app uses bucket: crm-uploads
--
-- Check policies:
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
-- order by policyname;
--
-- Go-live requirement:
-- - Authenticated users with the relevant module permission can upload files
--   under task, onsite, calibration, ticket, and certificate paths.
-- - Users can read files required by modules they can access.
-- - Upsert/replace requires INSERT + SELECT + UPDATE permissions.
-- - Public unauthenticated access should remain disabled unless explicitly
--   required.

