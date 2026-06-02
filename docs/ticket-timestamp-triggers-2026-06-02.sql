-- RD Palmer CRM ticket timestamp guardrail
-- Date: 2026-06-02
--
-- Purpose:
-- Future ticket and ticket product records should always record created_at and
-- updated_at, even if a frontend screen forgets to send those values.

create or replace function app_private.set_ticket_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, now());
    new.updated_at = coalesce(new.updated_at, new.created_at, now());
  elsif tg_op = 'UPDATE' then
    new.created_at = old.created_at;
    new.updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.set_ticket_timestamps() from public;

drop trigger if exists before_ticket_set_timestamps on public.ticket;
create trigger before_ticket_set_timestamps
before insert or update on public.ticket
for each row
execute function app_private.set_ticket_timestamps();

create or replace function app_private.set_ticket_product_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, now());
    new.updated_at = coalesce(new.updated_at, new.created_at, now());
  elsif tg_op = 'UPDATE' then
    new.created_at = old.created_at;
    new.updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.set_ticket_product_timestamps() from public;

drop trigger if exists before_ticket_product_set_timestamps on public.ticket_product;
create trigger before_ticket_product_set_timestamps
before insert or update on public.ticket_product
for each row
execute function app_private.set_ticket_product_timestamps();
