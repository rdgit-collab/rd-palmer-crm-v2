-- RD Palmer CRM customer company-name spacing cleanup
-- Applied to Supabase project jpvjqmkvtnedpmmrddft on 2026-06-05.
--
-- Scope:
-- - public.customer.company_name only
-- - Collapses repeated whitespace to one normal space
-- - Trims leading/trailing whitespace
--
-- Backup:
-- Affected rows were saved before update in:
-- app_private.customer_company_name_spacing_backup_20260605

create table if not exists app_private.customer_company_name_spacing_backup_20260605 as
select
  id,
  company_name as old_company_name,
  btrim(regexp_replace(company_name, '[[:space:]]+', ' ', 'g')) as new_company_name,
  now() as backed_up_at
from public.customer
where company_name is not null
  and company_name <> btrim(regexp_replace(company_name, '[[:space:]]+', ' ', 'g'));

update public.customer
set
  company_name = btrim(regexp_replace(company_name, '[[:space:]]+', ' ', 'g')),
  updated_at = now()
where company_name is not null
  and company_name <> btrim(regexp_replace(company_name, '[[:space:]]+', ' ', 'g'));

-- Verification queries:
select count(*) as remaining_spacing_issues
from public.customer
where company_name is not null
  and company_name <> btrim(regexp_replace(company_name, '[[:space:]]+', ' ', 'g'));

select count(*) as backed_up_rows
from app_private.customer_company_name_spacing_backup_20260605;
