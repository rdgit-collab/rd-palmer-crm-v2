# Dashboard RPC Calculations - 2026-06-05

## Purpose

Sales and service dashboard totals were previously calculated in the React frontend by downloading large table sets, especially tickets, tasks, onsite tickets, leads, activities, quotations, and invoices.

This pass moves the heavy dashboard calculation into Supabase database functions so the frontend asks the database for finished dashboard summaries instead of pulling thousands of rows into the browser.

## Supabase Functions Added

- `public.get_service_dashboard_summary(p_month text)`
- `public.get_sales_dashboard_summary(p_month text, p_current_user_id integer, p_restricted boolean)`

Both functions return JSON used directly by `src/pages/Dashboard.jsx`.

## Frontend Change

`src/pages/Dashboard.jsx` now uses:

- `supabase.rpc('get_service_dashboard_summary', { p_month: staffMonth })`
- `supabase.rpc('get_sales_dashboard_summary', { p_month: performanceMonth, p_current_user_id, p_restricted })`

The dashboard still uses small direct queries for recent tickets, recent tasks, recent leads, and recent activities.

## Notes

- The functions are additive and do not modify CRM data.
- The service function returns `stats`, `staffRows`, and `attentionItems`.
- The sales function returns `stats`, `salesRows`, and `followUpItems`.
- `npm run build` passed after wiring the frontend to the RPC functions.
