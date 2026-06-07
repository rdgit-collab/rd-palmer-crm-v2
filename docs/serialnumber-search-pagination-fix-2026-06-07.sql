-- Serial number module search and last-page pagination performance support.
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-07.
--
-- The frontend now avoids deep OFFSET for the last page and avoids expensive
-- counted partial searches. These trigram indexes support fast ilike searches.

create extension if not exists pg_trgm;

create index if not exists idx_serialnumber_serial_number_trgm
  on public.serialnumber using gin (serial_number gin_trgm_ops);

create index if not exists idx_serialnumber_sku_trgm
  on public.serialnumber using gin (sku gin_trgm_ops);

create index if not exists idx_serialnumber_customername_trgm
  on public.serialnumber using gin (customername gin_trgm_ops);

create index if not exists idx_serialnumber_ref_number_trgm
  on public.serialnumber using gin (ref_number gin_trgm_ops);
