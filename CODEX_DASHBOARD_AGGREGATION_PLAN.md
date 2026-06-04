# Plan — Move dashboard aggregation into the database (Service + Sales)

## Goal
Both the Sales and Service dashboards are slow because they download entire tables (thousands of rows) to the browser and compute the summary numbers in JavaScript. This plan moves that counting into the Postgres database (Supabase) so the dashboard fetches only a small set of pre-computed numbers.

## How to use this plan
There are two independent pieces of work:
- **Phase 0A — Quick relief.** A loading spinner + optional safe trims. Tiny, zero-to-low risk, changes no numbers. **Ship this first, on its own**, for immediate user-visible improvement.
- **Phases 0B → 4 — The real fix.** Move aggregation into the database behind an off-by-default flag, verify the numbers match exactly, then flip the flag. This is the proper performance fix and is built/verified carefully.

You can ship Phase 0A and stop there if you only want quick relief; the later phases are the durable fix.

## NON-NEGOTIABLE SAFETY RULES (read first)
This change must not put any existing data or functionality at risk. Obey all of the following:

1. **Additive only.** You may only CREATE NEW read-only database functions (RPCs). You must NOT alter, drop, or rename any existing table, column, view, policy, trigger, or function. No `ALTER TABLE`, no `DROP`, no data writes of any kind.
2. **No `SECURITY DEFINER` unless required, and never to bypass RLS.** The new functions must respect existing Row Level Security so a user can never see data they couldn't already see. Default to `SECURITY INVOKER`. Verify the per-user/per-role scoping below still holds.
3. **The numbers must be IDENTICAL to today's dashboard.** The existing JavaScript is the source of truth. The new DB functions must reproduce the exact same totals, filters, date logic, and per-staff/per-salesperson breakdowns. Do not "improve" or "simplify" any business rule.
4. **Feature-flagged rollout.** Implement the new path behind a flag (a constant `USE_DB_AGGREGATION` in the dashboard file, default `false`). Keep the existing JavaScript aggregation code fully intact and working. The new path is only used when the flag is `true`. This guarantees instant rollback by flipping one boolean — no code deletion.
5. **Verify before switch.** Provide a way to run both paths and compare outputs (see Phase 3) before anyone flips the flag on in production.
6. **No new npm dependencies. No routing or auth changes.**

If any requirement above cannot be met for a given metric, STOP and leave that metric on the existing JavaScript path. Partial migration is acceptable; a wrong number is not.

---

## Reference: what the current dashboards compute (do not change these rules)

File: `src/pages/Dashboard.jsx`

### Service dashboard (`ServiceDashboard`, ~line 687)
Currently pulls ALL rows of `ticket`, `task`, `onsiteticket` via `fetchAllRows` plus 5 `head:true` count queries, then computes in JS:
- `openTickets`, `openTasks`, `onsiteTickets` = count where `is_completed = 0`
- `overdueTickets` = open tickets with `due_date < today`
- `rmaCount` = rma where `date_return is null`
- `completedWork` = (tasks completed in selected month) + (onsites completed in month) + (tickets completed in month). "Completed" = `is_completed = 1` OR `status = 'Completed'`. "In month" uses, in order of preference: tasks→(enddate, startdate), onsites→(date), tickets→(due_date, date).
- `pendingWork` = open tasks + open onsites (onsite open = `is_completed != 1` AND `status != 'Completed'`)
- `dueToday` = open tasks with `enddate = today` + open tickets with `due_date = today`
- `completionRate` = completed / (completed + pending), rounded
- Per-staff table (`staffMap`): for each active service staff, counts of openTickets/openTasks/openOnsites, overdue, completed-this-month. Sorted by (pending + overdue) desc, top 8 shown.
- `attention` list: overdue open tickets + overdue open tasks, sorted by date, first 8.
- `recentTickets` (6) and `recentTasks` (5) — already bounded `.limit()` queries; LEAVE AS-IS.

### Sales dashboard (`SalesDashboard`, ~line 345)
Currently runs 5 `head:true` counts plus unbounded `allLeadsQuery`, `performanceActivitiesQuery`, `performanceQuotationsQuery`, `performanceInvoicesQuery`, then computes in JS:
- `customers`, `leads` (open leads count), `newLeadsThisMonth`, `quotations`, `invoices` (unpaid), `overdueInvoices`
- `quoteValueThisMonth`, `invoiceValueThisMonth`, `quoteConversion`
- Per-salesperson table (`salesMap`): openLeads/wonLeads/lostLeads, activities-this-month, quotations + value + converted, invoiceValue. Sorted, top 8.
- `followUpItems`: open leads whose last activity is older than 7 days (`staleIso`), top 8.
- **Scoping:** when `isSalesRole(profile.role_id)` is true, every metric is restricted to the current user's `legacyUserId` (see the `if (isSalesRestricted)` block and the `scoped*` filters). The DB functions MUST reproduce this exact scoping — accept the role/user as parameters and filter identically.
- `recentActivities` (8) and `recentLeads` (5) — already bounded; LEAVE AS-IS.

---

## Phase 0A — Quick relief (ship this FIRST, independently)
These two changes are tiny, safe, and give users an immediate improvement while the full database-aggregation work (Phases 0B–4) is built and verified separately. They do NOT change any number the dashboard shows. Ship Phase 0A on its own; it does not depend on any of the later phases.

### 1. Add a loading spinner to both dashboards (zero risk)
Today, both `SalesDashboard` (~line 345) and `ServiceDashboard` (~line 687) run a `Promise.all([...]).then(...)` with **no loading indicator**, so the screen looks frozen/blank for 1–2 seconds while data loads.

For EACH dashboard:
- Add a `const [loading, setLoading] = useState(true)` state.
- Set `setLoading(true)` at the very start of the `useEffect`, and `setLoading(false)` inside the `.then(...)` (also in a `.catch(...)` / `.finally(...)` so it never gets stuck on error).
- In the returned JSX, when `loading` is true, render the app's existing spinner pattern (reuse the same spinner markup used elsewhere, e.g. the `LoadingScreen` style in `src/App.jsx`: a `animate-spin` red ring with "Loading…"). Keep it simple — a centered spinner above or in place of the stat grid is fine.
- Do not otherwise restructure the component. The data logic stays exactly the same.

This makes the dashboard feel responsive and stable. It changes nothing about the computed values.

### 2. Bound the clearly-wasteful full-table pulls that feed ONLY short lists (low risk, verify each)
IMPORTANT: Several `fetchAllRows` pulls in `ServiceDashboard` are reused to compute TOTALS and the per-staff table — those must NOT be trimmed in Phase 0A (they're handled properly in the DB-aggregation phases). Only trim a full pull if, after tracing every use of its result variable, it feeds **exclusively** a bounded/sliced display list and no total or per-person aggregation.

Process for each candidate:
1. Pick a `fetchAllRows(...)` result variable (e.g. `allTickets`, `allTasks`, `allOnsites` in Service; `allLeads`, `performance*` in Sales).
2. Search every place that variable is read in the `.then(...)`.
3. If it is used in ANY count, `sum`, `reduce`, `staffMap`/`salesMap` build, or `completionRate`-type calculation → **leave it as a full pull for now** (Phase 1 will replace it with a DB function).
4. If it is used ONLY to build a list that is already `.slice(0, N)`'d (e.g. the `attention` list, which is sliced to 8) and nothing else → it MAY be replaced with a bounded query that fetches just what that list needs.

If in doubt, do NOT trim it. Leaving a pull in place is always safe; trimming one that secretly feeds a total would produce a wrong number. Phase 0A's trimming is optional — if no pull is *exclusively* feeding a short list, skip step 2 entirely and just ship the spinner.

### Phase 0A acceptance
- Both dashboards show a spinner while loading and never look frozen.
- Every displayed number and table is byte-for-byte the same as before (the spinner and any trim must not alter values). Compare before/after on the same data.
- `npm run build` passes.

---

## Phase 0B — Inspect, don't assume
Before writing any SQL:
1. Use the Supabase tooling to list the exact columns and types of: `ticket`, `task`, `onsiteticket`, `rma`, `customer`, `sales_lead`, `activity`, `quotation`, `invoice`, `stage`, `users`. Confirm every column the JS reads actually exists with the name used.
2. Confirm whether RLS is enabled on each and what the policies key off (role / legacy user id). The new functions must not widen access.
3. Confirm how "selected month" and "today" are derived so the SQL date math matches the JS (`monthRange`, `monthStartIso`, `staleIso = today - 7 days`). Pass these as parameters from JS rather than recomputing dates in SQL, to avoid timezone drift between browser and DB. **This is important: compute the date boundaries in JS exactly as today, and pass them into the RPC as text/date arguments.**

---

## Phase 1 — Create the read-only RPC functions (additive)
Create new Postgres functions, e.g. `dashboard_service_summary(...)` and `dashboard_sales_summary(...)`, that take the date boundaries and (for sales) the role + legacy user id as parameters, and return the summary numbers + the small per-staff / per-salesperson arrays as a single JSON object (or a small result set).

Guidelines:
- Use `SECURITY INVOKER` so RLS applies to the caller.
- Each function does the counting with SQL `count(...) FILTER (WHERE ...)`, `sum(...) FILTER (WHERE ...)`, and `GROUP BY assigned_to / sales_person` to produce the per-person tables.
- Reproduce the exact boolean rules above (e.g. completed = `is_completed = 1 OR status = 'Completed'`).
- Return at most the top-N rows the UI shows (e.g. 8) only if sorting in SQL exactly matches the JS sort; otherwise return all grouped rows and keep the existing JS sort/slice on the (now tiny) result.
- Add the indexes from the earlier performance doc if not already present (`is_completed`, `due_date`, `date`, foreign keys) — these are additive and safe.

Apply via a migration. Keep the migration file in the repo so it is reviewable and reversible (the rollback is simply `DROP FUNCTION` on the new functions — they are new, so dropping them restores the original state exactly).

---

## Phase 2 — Wire the dashboard behind a flag (existing path untouched)
In `src/pages/Dashboard.jsx`:
1. Add `const USE_DB_AGGREGATION = false` near the top.
2. In each dashboard's `useEffect`, branch:
   - if `USE_DB_AGGREGATION` is false → run the existing code exactly as now (no behavior change shipped).
   - if true → call the new `supabase.rpc('dashboard_service_summary', {...})` / `dashboard_sales_summary` with the JS-computed date params, map the returned numbers into the same `setStats(...)` / `setSalesRows(...)` / `setStaffRows(...)` shapes, and keep the already-bounded `recent*` queries as-is.
3. Do not delete or modify the existing aggregation functions/helpers. The new branch sits alongside.
4. Also add a visible loading state (spinner) in both branches so the UI never looks frozen.

---

## Phase 3 — Verification (must pass before flag flips on)
1. Build a temporary dev-only comparison: for a few representative users (one admin, one restricted sales user, one service staff) and several months, run BOTH paths and assert every number and every per-person row matches exactly. Log any mismatch. Do not flip the flag until matches are clean.
2. Confirm a restricted sales user sees only their own scoped numbers via the RPC (RLS + parameter scoping), identical to today.
3. `npm run build` compiles cleanly.
4. Manual smoke test: open both dashboards with the flag ON in a staging/dev environment, change the month selector, confirm numbers and tables look right and load is fast.

## Phase 4 — Flip the flag
Only after Phase 3 passes, set `USE_DB_AGGREGATION = true`. If anything looks wrong in production, set it back to `false` to instantly revert to the original behavior. Keep the old path in the codebase for at least one release cycle.

---

## Deliverables Codex should produce
**Phase 0A (ship first, separate commit/PR):**
1. Edits to `src/pages/Dashboard.jsx` adding a loading spinner to both dashboards (and any safe, verified list-only trims). No numbers changed. `npm run build` passes.

**Phases 0B–4 (the durable fix, separate commit/PR):**
2. A migration file adding the new read-only RPC functions (+ any missing indexes), with a clear `DROP FUNCTION` rollback noted in comments.
3. Edits to `src/pages/Dashboard.jsx` adding the `USE_DB_AGGREGATION` flag (default false) and the RPC branch — leaving the existing JS path intact.
4. The Phase 3 comparison results (or a short script/notes showing the numbers match exactly).
5. Confirmation that `npm run build` passes.

## What Codex must NOT do
- Must not modify or drop existing tables, columns, views, triggers, policies, or functions.
- Must not change the meaning of any metric.
- Must not remove the existing JavaScript aggregation path.
- Must not bypass RLS or widen data visibility.
- Must not add dependencies or change routing/auth.
