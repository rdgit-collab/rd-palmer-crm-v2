-- 2026-06-05
-- Purpose:
-- Supabase security advisor flagged the new sales search RPCs as having mutable
-- search_path. These functions use schema-qualified table references, so pinning
-- the search_path is a low-risk hardening change.

alter function public.search_activities(text, text, text, text, integer, boolean, integer, integer, date, date) set search_path = '';
alter function public.search_leads(text, text, text, integer, integer, boolean, text[], integer, integer) set search_path = '';
alter function public.search_customers(text, integer, integer) set search_path = '';
alter function public.search_quotations(text, integer, boolean, integer, integer) set search_path = '';
alter function public.search_invoices(text, integer, boolean, integer, integer) set search_path = '';
