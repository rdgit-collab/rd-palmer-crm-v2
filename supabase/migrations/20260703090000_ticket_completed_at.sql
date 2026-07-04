-- Adds a completion timestamp to tickets so management can measure turnaround
-- time (created -> completed) and on-time completion against the due date.
-- Additive only: new nullable column + partial index. Existing completed rows
-- keep NULL (no reliable historical completion time is stored). The value is
-- set/cleared by the application when a ticket is completed or reopened.

alter table public.ticket
  add column if not exists completed_at timestamp without time zone;

comment on column public.ticket.completed_at is
  'When the ticket was marked completed; cleared on reopen. Set by the app. NULL for tickets completed before 2026-07 (no backfill source).';

create index if not exists idx_ticket_completed_at
  on public.ticket (completed_at)
  where completed_at is not null;
