-- Booking module schema and seed data.
-- Scope: new booking_* tables only, plus module_permission rows for the new sidebar module.

create table if not exists public.booking_venues (
  id bigserial primary key,
  name text not null unique,
  location text,
  capacity integer,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_equipment_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.booking_equipment_groups (
  id text primary key,
  category_id text not null references public.booking_equipment_categories(id) on update cascade,
  name text not null,
  booking_rule text,
  location text,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.booking_equipment_items (
  id text primary key,
  group_id text not null references public.booking_equipment_groups(id) on update cascade,
  name text not null,
  serial_no text,
  quantity integer not null default 1 check (quantity > 0),
  location text,
  required_for_complete_set boolean not null default false,
  status text not null default 'available' check (status in ('available','booked','loaned','under_repair','missing','check_required')),
  notes text,
  is_bookable boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_type text not null check (booking_type in ('venue','equipment')),
  venue_id bigint references public.booking_venues(id),
  requested_by_user_id uuid not null references public.users(id),
  requested_by_old_user_id integer,
  purpose text not null,
  customer_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','cancelled','completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_valid_range check (end_at > start_at),
  constraint booking_venue_required check (
    (booking_type = 'venue' and venue_id is not null) or
    (booking_type = 'equipment' and venue_id is null)
  )
);

create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  equipment_item_id text not null references public.booking_equipment_items(id) on update cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (booking_id, equipment_item_id)
);

create index if not exists idx_bookings_type_status_start on public.bookings (booking_type, status, start_at);
create index if not exists idx_bookings_venue_period on public.bookings (venue_id, start_at, end_at) where status in ('pending','approved');
create index if not exists idx_bookings_requested_by_user_id on public.bookings (requested_by_user_id);
create index if not exists idx_booking_items_booking_id on public.booking_items (booking_id);
create index if not exists idx_booking_items_equipment_item_id on public.booking_items (equipment_item_id);
create index if not exists idx_booking_groups_category_id on public.booking_equipment_groups (category_id);
create index if not exists idx_booking_items_group_id on public.booking_equipment_items (group_id);

create or replace function public.booking_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_touch_updated_at on public.bookings;
create trigger trg_bookings_touch_updated_at
before update on public.bookings
for each row execute function public.booking_touch_updated_at();

create or replace function public.booking_prevent_conflicts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('pending','approved') then
    return new;
  end if;

  if new.booking_type = 'venue' then
    if exists (
      select 1
      from public.bookings b
      where b.id <> new.id
        and b.booking_type = 'venue'
        and b.venue_id = new.venue_id
        and b.status in ('pending','approved')
        and b.start_at < new.end_at
        and b.end_at > new.start_at
    ) then
      raise exception 'This venue is already booked for the selected date/time.';
    end if;
  else
    if exists (
      select 1
      from public.booking_items bi
      join public.booking_items other_bi on other_bi.equipment_item_id = bi.equipment_item_id
      join public.bookings other_b on other_b.id = other_bi.booking_id
      where bi.booking_id = new.id
        and other_b.id <> new.id
        and other_b.status in ('pending','approved')
        and other_b.start_at < new.end_at
        and other_b.end_at > new.start_at
    ) then
      raise exception 'One or more selected equipment items are already booked for the selected date/time.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_prevent_conflicts on public.bookings;
create trigger trg_bookings_prevent_conflicts
before insert or update on public.bookings
for each row execute function public.booking_prevent_conflicts();

create or replace function public.booking_item_prevent_conflicts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_booking public.bookings%rowtype;
  target_item public.booking_equipment_items%rowtype;
begin
  select * into target_booking from public.bookings where id = new.booking_id;
  if not found then
    raise exception 'Booking not found.';
  end if;

  select * into target_item from public.booking_equipment_items where id = new.equipment_item_id;
  if not found then
    raise exception 'Equipment item not found.';
  end if;

  if target_booking.booking_type <> 'equipment' then
    raise exception 'Equipment items can only be attached to equipment bookings.';
  end if;

  if target_item.is_bookable is not true or target_item.status in ('loaned','under_repair','missing','check_required') then
    raise exception 'This equipment item is not currently bookable.';
  end if;

  if target_booking.status in ('pending','approved') and exists (
    select 1
    from public.booking_items other_bi
    join public.bookings other_b on other_b.id = other_bi.booking_id
    where other_bi.equipment_item_id = new.equipment_item_id
      and other_b.id <> new.booking_id
      and other_b.status in ('pending','approved')
      and other_b.start_at < target_booking.end_at
      and other_b.end_at > target_booking.start_at
  ) then
    raise exception 'This equipment item is already booked for the selected date/time.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_items_prevent_conflicts on public.booking_items;
create trigger trg_booking_items_prevent_conflicts
before insert or update on public.booking_items
for each row execute function public.booking_item_prevent_conflicts();

alter table public.booking_venues enable row level security;
alter table public.booking_equipment_categories enable row level security;
alter table public.booking_equipment_groups enable row level security;
alter table public.booking_equipment_items enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;

grant select on public.booking_venues, public.booking_equipment_categories, public.booking_equipment_groups, public.booking_equipment_items, public.bookings, public.booking_items to authenticated;
grant insert, update, delete on public.bookings, public.booking_items to authenticated;
grant usage, select on sequence public.booking_venues_id_seq to authenticated;

drop policy if exists "Authenticated users can read booking venues" on public.booking_venues;
create policy "Authenticated users can read booking venues" on public.booking_venues for select to authenticated using (true);
drop policy if exists "Authenticated users can read booking categories" on public.booking_equipment_categories;
create policy "Authenticated users can read booking categories" on public.booking_equipment_categories for select to authenticated using (true);
drop policy if exists "Authenticated users can read booking groups" on public.booking_equipment_groups;
create policy "Authenticated users can read booking groups" on public.booking_equipment_groups for select to authenticated using (true);
drop policy if exists "Authenticated users can read booking equipment items" on public.booking_equipment_items;
create policy "Authenticated users can read booking equipment items" on public.booking_equipment_items for select to authenticated using (true);
drop policy if exists "Authenticated users can read bookings" on public.bookings;
create policy "Authenticated users can read bookings" on public.bookings for select to authenticated using (true);
drop policy if exists "Authenticated users can create bookings" on public.bookings;
create policy "Authenticated users can create bookings" on public.bookings for insert to authenticated with check ((select auth.uid()) = requested_by_user_id);
drop policy if exists "Authenticated users can update bookings" on public.bookings;
create policy "Authenticated users can update bookings" on public.bookings for update to authenticated using (
  requested_by_user_id = (select auth.uid())
  or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
) with check (
  requested_by_user_id = (select auth.uid())
  or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
);
drop policy if exists "Authenticated users can delete bookings" on public.bookings;
create policy "Authenticated users can delete bookings" on public.bookings for delete to authenticated using (
  requested_by_user_id = (select auth.uid())
  or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
);
drop policy if exists "Authenticated users can read booking items" on public.booking_items;
create policy "Authenticated users can read booking items" on public.booking_items for select to authenticated using (true);
drop policy if exists "Authenticated users can create booking items" on public.booking_items;
create policy "Authenticated users can create booking items" on public.booking_items for insert to authenticated with check (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (
        b.requested_by_user_id = (select auth.uid())
        or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
      )
  )
);
drop policy if exists "Authenticated users can update booking items" on public.booking_items;
create policy "Authenticated users can update booking items" on public.booking_items for update to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (
        b.requested_by_user_id = (select auth.uid())
        or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
      )
  )
) with check (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (
        b.requested_by_user_id = (select auth.uid())
        or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
      )
  )
);
drop policy if exists "Authenticated users can delete booking items" on public.booking_items;
create policy "Authenticated users can delete booking items" on public.booking_items for delete to authenticated using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (
        b.requested_by_user_id = (select auth.uid())
        or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role_id in (1, 99))
      )
  )
);

insert into public.module_permission (role_id, module, can_access)
values (2, 'booking', true), (3, 'booking', true), (4, 'booking', true), (5, 'booking', true)
on conflict (role_id, module) do update set can_access = excluded.can_access;

insert into public.booking_venues (name, location, sort_order)
values
  ('Meeting Room 1', 'Office', 1),
  ('Meeting Room 2', 'Office', 2),
  ('Training / Demo Room', 'Office', 3)
on conflict (name) do update set location = excluded.location, sort_order = excluded.sort_order, is_active = true;

insert into public.booking_equipment_categories (id, name, sort_order) values
  ('GPR', 'GPR', 1),
  ('EML', 'EML Locator', 2),
  ('RTK', 'RTK / Survey', 3),
  ('LEAK', 'Leak Detection / Water Monitoring', 4),
  ('PEG', 'Valve Operation / Pegasus', 5),
  ('CFL', 'Cable Fault Location', 6),
  ('HV', 'High Voltage Testing', 7),
  ('TOOL', 'Demo Tools / General', 8)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

insert into public.booking_equipment_groups (id, category_id, name, booking_rule, location, notes, sort_order) values
  ('GPR-001','GPR','MALA EL Core Kit','Tablet should be recommended when EL Core is selected.','Office',null,1),
  ('GPR-002','GPR','MIRA Compact Set','Dell Latitude 7330 must stay under this group. Complete set includes antenna, frame, and laptop.',null,'Dell Latitude location marked Moon; confirm before go-live.',2),
  ('GPR-003','GPR','GPR Tablets / Displays','Keep separate only if not permanently paired to another kit.',null,null,3),
  ('EML-001','EML','RD7200 Set','If locator is selected, recommend TX5, clamp, and bag.',null,null,1),
  ('EML-002','EML','RD8200 Set','TX10 can be booked separately but should be recommended with locator.',null,null,2),
  ('EML-003','EML','RD8200G Set','Complete set includes locator, TX10, clamp, bag, rechargeable battery, and charger.',null,null,3),
  ('EML-004','EML','RD82SG Set',null,null,null,4),
  ('EML-005','EML','Spare TX5',null,'Tech Room',null,5),
  ('EML-006','EML','Sales Battery Packs',null,'Office','Quantity noted as 24.',6),
  ('RTK-001','RTK','Base RTK Set',null,'Robbin',null,1),
  ('RTK-002','RTK','Rover RTK Set',null,'Robbin',null,2),
  ('RTK-003','RTK','FM Antenna Kit',null,'Admin Room',null,3),
  ('RTK-004','RTK','Rover RTK Hand Pole Kit',null,'Admin Room',null,4),
  ('LEAK-001','LEAK','Water Meter',null,'With Robbin',null,1),
  ('LEAK-002','LEAK','LX2 Modbus Logger Set',null,null,'V-Torch antenna loaned to SATU / check status.',2),
  ('LEAK-003','LEAK','DXMIC Pro Set',null,'Office',null,3),
  ('LEAK-004','LEAK','Patroller 4 HWM 869 Standard',null,'Tech Room',null,4),
  ('LEAK-005','LEAK','PCorr+ EU Blue Set',null,'Tech Room','Serial range 09200351-09200360; split later if each unit must be booked separately.',5),
  ('LEAK-006','LEAK','TMic Portable Electronic Listening Stick',null,'Tech Room',null,6),
  ('LEAK-007','LEAK','IR Reader',null,'Tech Room',null,7),
  ('LEAK-008','LEAK','Permanet+ GPS Set 1',null,'Tech Room',null,8),
  ('LEAK-009','LEAK','Permanet+ GPS Set 2',null,'Tech Room',null,9),
  ('LEAK-010','LEAK','Logger LX Set',null,'Robbin','Antenna and lead need checking.',10),
  ('LEAK-011','LEAK','Pressure Transient Set',null,'With Robbin for testing',null,11),
  ('LEAK-012','LEAK','Programming Cable Sets',null,'Tech Room','Quantity accessories.',12),
  ('PEG-001','PEG','Pegasus+ GPRS Set',null,'Site AIS HL / TID194','At site.',1),
  ('PEG-002','PEG','Pegasus2 Set, PBA Loan',null,'PBA','Loan to PBA until TBA.',2),
  ('PEG-003','PEG','Pegasus2 Set, Tech Room Level 2',null,'Tech Room Level 2','Confirmed with Farah 11/5/26.',3),
  ('CFL-001','CFL','Tanbos T20 Cable Fault Set',null,'Tech Room',null,1),
  ('CFL-002','CFL','Cable Fault Equipment, 2026 Set','Items can also be booked standalone.','Office',null,2),
  ('HV-001','HV','DT80 60kV Set',null,'Lobby Area / Fazil Room','Sent back to supplier on 13/5; confirm before booking.',1),
  ('TOOL-001','TOOL','Hydraulic Crimping Tool',null,'Tech Room',null,1),
  ('TOOL-002','TOOL','Coil Hose',null,'Tech Room','Quantity item.',2)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  booking_rule = excluded.booking_rule,
  location = excluded.location,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.booking_equipment_items (id, group_id, name, serial_no, quantity, location, required_for_complete_set, status, notes, sort_order) values
  ('GPR-001-01','GPR-001','MALA EL Core Kit','28929005',1,'Office',true,'available','Main EL Core unit',1),
  ('GPR-001-02','GPR-001','Xiaomi Pad 6 Tablet for EL Core','47854/04NW01045',1,'Office',true,'available','Paired display/tablet',2),
  ('GPR-002-01','GPR-002','MIRA Compact Antenna','30282001',1,'Office',true,'available',null,1),
  ('GPR-002-02','GPR-002','MIRA Compact Frame','30302003',1,'Office',true,'available',null,2),
  ('GPR-002-03','GPR-002','Dell Latitude 7330 Rugged Extreme','2K2DBT3',1,'Moon',true,'check_required','Must be paired with MIRA Compact; confirm location.',3),
  ('GPR-003-01','GPR-003','Rugged Tablet','OR10116QA14N00134',1,'Customer',false,'check_required','Previous S/N: T1XAB8870NXA24L0418',1),
  ('GPR-003-02','GPR-003','Samsung Galaxy Tab Active Pro','R52RA0CBHDV',1,'Office',false,'available','General GPR/display asset',2),
  ('GPR-003-03','GPR-003','MALA Li-Ion Battery Pack','46988-89 / 11588039 / 12560008 / 46429 / 45379',1,'Tech Room',false,'available','Multiple battery serials in one row',3),
  ('EML-001-01','EML-001','RD7200 Locator','724',1,'Office',true,'available','Main locator',1),
  ('EML-001-02','EML-001','TX5 Transmitter','507',1,'Office',true,'available','Paired transmitter',2),
  ('EML-001-03','EML-001','Clamp','N/A',1,'Tech Room',true,'available',null,3),
  ('EML-001-04','EML-001','Bag','N/A',1,'Tech Room',true,'available',null,4),
  ('EML-002-01','EML-002','RD8200 Locator','7490',1,'Office',true,'available','Main locator',1),
  ('EML-002-02','EML-002','TX10 Transmitter','946321967',1,'Office',true,'available','TX10 upper body loan to Rizla',2),
  ('EML-002-03','EML-002','Clamp','N/A',1,'Office',true,'available',null,3),
  ('EML-002-04','EML-002','Bag','N/A',1,'Office',true,'available',null,4),
  ('EML-003-01','EML-003','RD8200G Locator','2718',1,'Outside Office',true,'available','Main locator',1),
  ('EML-003-02','EML-003','TX10 Transmitter','808',1,'Outside Office',true,'available','Paired transmitter',2),
  ('EML-003-03','EML-003','Clamp','N/A',1,'Outside Office',true,'available',null,3),
  ('EML-003-04','EML-003','Bag','N/A',1,'Outside Office',true,'available',null,4),
  ('EML-003-05','EML-003','Rechargeable Battery','N/A',1,'Outside Office',true,'available',null,5),
  ('EML-003-06','EML-003','Charger','N/A',1,'Outside Office',true,'available',null,6),
  ('EML-004-01','EML-004','RD82SG Locator','146',1,'Office',true,'available','Main locator',1),
  ('EML-004-02','EML-004','Rechargeable Battery Pack','N/A',1,'Office',true,'available',null,2),
  ('EML-004-03','EML-004','Charger','N/A',1,'Office',true,'available',null,3),
  ('EML-004-04','EML-004','Soft Carry Bag','N/A',1,'Office',true,'available',null,4),
  ('EML-004-05','EML-004','Phone Holder','N/A',1,'Office',true,'available',null,5),
  ('EML-005-01','EML-005','TX5 Transmitter','FCC-1678',1,'Tech Room',false,'available','Spare/new TX5',1),
  ('EML-006-01','EML-006','RX Rechargeable Battery Pack','N/A',24,'Office',false,'available','For sales use',1),
  ('EML-006-02','EML-006','TX Rechargeable Battery Pack','N/A',24,'Office',false,'available','For sales use',2),
  ('RTK-001-01','RTK-001','Base RTK','15547449',1,'Robbin',true,'available',null,1),
  ('RTK-001-02','RTK-001','Base RTK Antenna, Grey','16677844',1,'Robbin',true,'available',null,2),
  ('RTK-001-03','RTK-001','FM Amplifier','N/A',1,'Robbin',true,'available',null,3),
  ('RTK-001-04','RTK-001','FM Amplifier Cable, 4 pin','N/A',1,'Robbin',true,'available',null,4),
  ('RTK-001-05','RTK-001','Charger','N/A',1,'Robbin',true,'available',null,5),
  ('RTK-001-06','RTK-001','Metal Plate Accessories','N/A',1,'Robbin',true,'available',null,6),
  ('RTK-001-07','RTK-001','Measurement Tape','N/A',1,'Robbin',true,'available',null,7),
  ('RTK-001-08','RTK-001','Casing','N/A',1,'Robbin',true,'available',null,8),
  ('RTK-002-01','RTK-002','Rover RTK','N/A',1,'Robbin',true,'available','Main rover',1),
  ('RTK-002-02','RTK-002','Rover RTK Antenna, Grey','16677111',1,'Robbin',true,'available',null,2),
  ('RTK-002-03','RTK-002','Rover RTK Stick, Yellow','N/A',1,'Robbin',true,'available',null,3),
  ('RTK-002-04','RTK-002','Rover RTK Screw, Silver','N/A',1,'Robbin',true,'available',null,4),
  ('RTK-002-05','RTK-002','Handheld Controller','16820056',1,'Robbin',true,'available','Controller',5),
  ('RTK-002-06','RTK-002','Controller Holder','N/A',1,'Robbin',true,'available',null,6),
  ('RTK-002-07','RTK-002','Charger','N/A',1,'Robbin',true,'available',null,7),
  ('RTK-002-08','RTK-002','Metal Plate Accessories','N/A',1,'Robbin',true,'available',null,8),
  ('RTK-002-09','RTK-002','Casing','N/A',1,'Robbin',true,'available',null,9),
  ('RTK-003-01','RTK-003','FM Antenna','N/A',1,'Admin Room',true,'available',null,1),
  ('RTK-003-02','RTK-003','FM Antenna Pole','N/A',1,'Admin Room',true,'available',null,2),
  ('RTK-003-03','RTK-003','FM Amplifier Power Cable','N/A',1,'Admin Room',true,'available',null,3),
  ('RTK-003-04','RTK-003','FM Antenna Cable','N/A',1,'Admin Room',true,'available',null,4),
  ('RTK-003-05','RTK-003','Bag','N/A',1,'Admin Room',true,'available',null,5),
  ('RTK-004-01','RTK-004','Rover RTK Hand Pole','N/A',1,'Admin Room',true,'available',null,1),
  ('RTK-004-02','RTK-004','Bag','N/A',1,'Admin Room',true,'available',null,2),
  ('LEAK-001-01','LEAK-001','Water Meter SU150-GN','11801',1,'With Robbin',true,'available','Standalone demo item',1),
  ('LEAK-002-01','LEAK-002','LX2 Modbus Logger','92255',1,'Main Store Room',true,'available','Out from stock rack',1),
  ('LEAK-002-02','LEAK-002','V-Torch Antenna','N/A',1,'Loaned to SATU / check status',true,'check_required','Loan to SATU for 1 month POC estimated until May 2025',2),
  ('LEAK-003-01','LEAK-003','DXMIC Pro with Ground Microphone','1102',1,'Office',true,'available','Listening/leak detection item',1),
  ('LEAK-004-01','LEAK-004','Patroller 4 HWM 869 Standard','287',1,'Tech Room',true,'available','Standalone item',1),
  ('LEAK-005-01','LEAK-005','PCorr+ EU Blue Logger Range','09200351-09200360',1,'Tech Room',true,'available','Multiple serial range; split later if required',1),
  ('LEAK-006-01','LEAK-006','TMic Portable Electronic Listening Stick','1027',1,'Tech Room',true,'available',null,1),
  ('LEAK-007-01','LEAK-007','IR Reader','14475',1,'Tech Room',true,'available',null,1),
  ('LEAK-008-01','LEAK-008','Permanet+ GPS Logger','161720',1,'Tech Room',true,'available','Logger 1',1),
  ('LEAK-008-02','LEAK-008','Permanet+ GPS Logger','161721',1,'Tech Room',true,'available','Logger 2',2),
  ('LEAK-008-03','LEAK-008','Hydrophone 2 Kit','404',1,'Tech Room',true,'available','Hydrophone 1',3),
  ('LEAK-008-04','LEAK-008','Hydrophone 2 Kit','405',1,'Tech Room',true,'available','Hydrophone 2',4),
  ('LEAK-009-01','LEAK-009','Permanet+ GPS Logger','164161',1,'Tech Room',true,'available','Logger 1',1),
  ('LEAK-009-02','LEAK-009','Permanet+ GPS Logger','164162',1,'Tech Room',true,'available','Logger 2',2),
  ('LEAK-009-03','LEAK-009','Hydrophone 2 Kit','659',1,'Tech Room',true,'available','Hydrophone 1',3),
  ('LEAK-009-04','LEAK-009','Hydrophone 2 Kit','532',1,'Tech Room',true,'available','Hydrophone 2',4),
  ('LEAK-010-01','LEAK-010','Logger LX/5B/1/MAL3','174576',1,'Robbin',true,'available','Robbin confirmed only logger with him',1),
  ('LEAK-010-02','LEAK-010','V-Torch Antenna','N/A',1,'Unknown / Check',true,'check_required','Robbin did not receive antenna',2),
  ('LEAK-010-03','LEAK-010','Lead RAG R94','N/A',1,'Unknown / Check',true,'check_required','Robbin did not receive lead',3),
  ('LEAK-011-01','LEAK-011','Pressure Transient Logger','40681',1,'With Robbin for testing',true,'available','Logger 1',1),
  ('LEAK-011-02','LEAK-011','Pressure Transient Logger','40682',1,'With Robbin for testing',true,'available','Logger 2',2),
  ('LEAK-011-03','LEAK-011','Pressure Transient Logger','40683',1,'With Robbin for testing',true,'available','Logger 3',3),
  ('LEAK-011-04','LEAK-011','Pressure Transient Logger','40684',1,'With Robbin for testing',true,'available','Logger 4',4),
  ('LEAK-011-05','LEAK-011','Logger Kit SEN8335','118036',1,'With Robbin for testing',true,'available','Kit 1',5),
  ('LEAK-011-06','LEAK-011','Logger Kit SEN8335','118040',1,'With Robbin for testing',true,'available','Kit 2',6),
  ('LEAK-011-07','LEAK-011','Logger Kit SEN8335','118041',1,'With Robbin for testing',true,'available','Kit 3',7),
  ('LEAK-011-08','LEAK-011','Logger Kit SEN8335','118042',1,'With Robbin for testing',true,'available','Kit 4',8),
  ('LEAK-011-09','LEAK-011','Link Cable CABA8585','N/A',4,'With Robbin for testing',true,'available','Original says 4 units link cable',9),
  ('LEAK-012-01','LEAK-012','Programming Cable for Permanet+ / Comlog Version','N/A',3,'Tech Room',false,'available','Robbin fabrication',1),
  ('LEAK-012-02','LEAK-012','Programming Cable for ML2','N/A',6,'Tech Room',false,'available','Robbin / Tech fabrication',2),
  ('PEG-001-01','PEG-001','Pegasus+ GPRS Control Box','44949',1,'Site AIS HL / TID194',true,'loaned','At site',1),
  ('PEG-001-02','PEG-001','Solenoid Box','1411-0032',1,'Site AIS HL / TID194',true,'loaned','Paired with control box',2),
  ('PEG-002-01','PEG-002','Pegasus2 Control Box','2777',1,'PBA',true,'loaned','Loan to PBA from 22/10 until TBA',1),
  ('PEG-002-02','PEG-002','Pegasus2 Solenoid Box','1778',1,'PBA',true,'loaned','Loan to PBA',2),
  ('PEG-002-03','PEG-002','Link Cable','N/A',1,'PBA',true,'loaned','Accessory',3),
  ('PEG-003-01','PEG-003','Pegasus2 Control Box','3376',1,'Tech Room Level 2',true,'available','Confirmed with Farah 11/5/26',1),
  ('PEG-003-02','PEG-003','Pegasus2 Solenoid Box','4886',1,'Tech Room Level 2',true,'available','Confirmed with Farah 11/5/26',2),
  ('PEG-003-03','PEG-003','Battery Pack for Pegasus2 CB','2CB-0092',1,'Tech Room Level 2',true,'available','Accessory',3),
  ('PEG-003-04','PEG-003','Battery Pack for Pegasus2 SB','2SB-0024',1,'Tech Room Level 2',true,'available','Accessory',4),
  ('PEG-003-05','PEG-003','Hydraulic Actuator','N/A',1,'Tech Room Level 2',true,'available','Quantity 1',5),
  ('CFL-001-01','CFL-001','Tanbos T20 Cable Fault HCI','X0180612010',1,'Tech Room',true,'available','Main HCI',1),
  ('CFL-001-02','CFL-001','T20','X0160808028',1,'Tech Room',true,'available','Component',2),
  ('CFL-001-03','CFL-001','LB4/60','T2016013023',1,'Tech Room',true,'under_repair','Faulty',3),
  ('CFL-001-04','CFL-001','LP30/2','T0160819001',1,'Tech Room',true,'available','Component',4),
  ('CFL-001-05','CFL-001','PP10','T2016003046',1,'Tech Room',true,'available','Component',5),
  ('CFL-002-01','CFL-002','CD650 Cable Fault Locating HV Signal Generator','TL115',1,'Office',true,'available','Can also be booked standalone',1),
  ('CFL-002-02','CFL-002','CD760 Power Cable Fault Locator','TF263',1,'Office',true,'available','Can also be booked standalone',2),
  ('CFL-002-03','CFL-002','CD850N Cable Fault Pin-Pointer','SK181',1,'Office',true,'available','Can also be booked standalone',3),
  ('CFL-002-04','CFL-002','CD550 Cable Identifier','RK251',1,'Office',true,'available','Can also be booked standalone',4),
  ('HV-001-01','HV-001','DT80-60KV','HA0282301B002',1,'Lobby Area / Fazil Room',true,'check_required','Sent back to supplier on 13/5, refer email',1),
  ('TOOL-001-01','TOOL-001','Battery Operated Hydraulic Crimping Tool B50-60/22','1040610SR05',1,'Tech Room',true,'available','Standalone item',1),
  ('TOOL-002-01','TOOL-002','Coil Hose','N/A',2,'Tech Room',false,'available','Quantity item',1)
on conflict (id) do update set
  group_id = excluded.group_id,
  name = excluded.name,
  serial_no = excluded.serial_no,
  quantity = excluded.quantity,
  location = excluded.location,
  required_for_complete_set = excluded.required_for_complete_set,
  status = excluded.status,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  is_bookable = true;
