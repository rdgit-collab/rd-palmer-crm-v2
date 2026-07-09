-- Secure public training signup.
-- Public browsers now submit through the training-register Edge Function.

create table if not exists public.training_signup_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_key, window_start, window_seconds)
);

alter table public.training_signup_rate_limits enable row level security;
revoke all on public.training_signup_rate_limits from public;
revoke all on public.training_signup_rate_limits from anon;
revoke all on public.training_signup_rate_limits from authenticated;
grant select, insert, update, delete on public.training_signup_rate_limits to service_role;

drop policy if exists training_regs_public_insert on public.training_registrations;
revoke insert on public.training_registrations from anon;

create index if not exists idx_training_regs_public_email_lookup
  on public.training_registrations (session_id, lower(btrim(email)))
  where source = 'public' and email is not null;

create index if not exists idx_training_regs_public_nric_lookup
  on public.training_registrations (session_id, regexp_replace(coalesce(nric, ''), '[^0-9]', '', 'g'))
  where source = 'public' and nric is not null;

alter table public.training_registrations
  drop constraint if exists training_regs_public_required_fields;

alter table public.training_registrations
  add constraint training_regs_public_required_fields
  check (
    source <> 'public'
    or (
      length(btrim(coalesce(participant_name, ''))) between 1 and 100
      and length(btrim(coalesce(company, ''))) between 1 and 500
      and length(btrim(coalesce(email, ''))) between 1 and 254
      and btrim(coalesce(email, '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and btrim(coalesce(phone, '')) ~ '^\+[1-9][0-9]{7,14}$'
      and btrim(coalesce(nric, '')) ~ '^[0-9]{12}$'
      and length(btrim(coalesce(industry, ''))) <= 200
      and length(btrim(coalesce(hr_email, ''))) <= 254
      and (
        nullif(btrim(coalesce(hr_email, '')), '') is null
        or btrim(coalesce(hr_email, '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    )
  ) not valid;

create or replace function public.claim_training_signup_rate_limit(
  p_ip_hash text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_time timestamptz := clock_timestamp();
  window_start_10m timestamptz;
  window_start_1h timestamptz;
  window_start_1m timestamptz;
  ip_10m_count integer;
  ip_1h_count integer;
  session_1m_count integer;
begin
  if nullif(btrim(coalesce(p_ip_hash, '')), '') is null or p_session_id is null then
    return jsonb_build_object('allowed', false, 'scope', 'invalid');
  end if;

  delete from public.training_signup_rate_limits
  where window_start < current_time - interval '2 hours';

  window_start_10m := to_timestamp(floor(extract(epoch from current_time) / 600) * 600);
  window_start_1h := to_timestamp(floor(extract(epoch from current_time) / 3600) * 3600);
  window_start_1m := to_timestamp(floor(extract(epoch from current_time) / 60) * 60);

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('ip10:' || p_ip_hash, window_start_10m, 600, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = current_time
  returning request_count into ip_10m_count;

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('ip60:' || p_ip_hash, window_start_1h, 3600, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = current_time
  returning request_count into ip_1h_count;

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('session60:' || p_session_id::text, window_start_1m, 60, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = current_time
  returning request_count into session_1m_count;

  if ip_10m_count > 5 then
    return jsonb_build_object('allowed', false, 'scope', 'ip');
  end if;

  if ip_1h_count > 20 then
    return jsonb_build_object('allowed', false, 'scope', 'ip');
  end if;

  if session_1m_count > 60 then
    return jsonb_build_object('allowed', false, 'scope', 'session');
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.claim_training_signup_rate_limit(text, uuid) from public;
revoke all on function public.claim_training_signup_rate_limit(text, uuid) from anon;
revoke all on function public.claim_training_signup_rate_limit(text, uuid) from authenticated;
grant execute on function public.claim_training_signup_rate_limit(text, uuid) to service_role;

create or replace function private.enforce_training_public_registration_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_capacity integer;
  session_open boolean;
  session_last_date date;
  registration_count integer;
  referral record;
  normalized_referral_code text;
  normalized_email text;
  normalized_nric text;
begin
  if new.source = 'public' then
    new.participant_name := nullif(btrim(regexp_replace(coalesce(new.participant_name, ''), '[[:cntrl:]]', ' ', 'g')), '');
    new.company := nullif(btrim(regexp_replace(coalesce(new.company, ''), '[[:cntrl:]]', ' ', 'g')), '');
    new.email := nullif(btrim(regexp_replace(coalesce(new.email, ''), '[[:cntrl:]]', ' ', 'g')), '');
    new.phone := nullif(btrim(regexp_replace(coalesce(new.phone, ''), '[[:cntrl:]]', ' ', 'g')), '');
    new.nric := nullif(regexp_replace(coalesce(new.nric, ''), '[^0-9]', '', 'g'), '');
    new.industry := nullif(btrim(regexp_replace(coalesce(new.industry, ''), '[[:cntrl:]]', ' ', 'g')), '');
    new.hr_email := nullif(btrim(regexp_replace(coalesce(new.hr_email, ''), '[[:cntrl:]]', ' ', 'g')), '');

    normalized_email := lower(new.email);
    normalized_nric := new.nric;

    normalized_referral_code := nullif(upper(btrim(coalesce(new.referral_code, ''))), '');
    new.referral_code := null;
    new.invited_by_user_id := null;
    new.invited_by_old_user_id := null;
    new.invited_by_name_snapshot := null;

    if normalized_referral_code is not null then
      select
        rc.referral_code,
        rc.user_id,
        u.old_user_id,
        nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '') as invited_by_name
      into referral
      from public.training_referral_codes rc
      join public.users u on u.id = rc.user_id
      where rc.referral_code = normalized_referral_code
        and rc.is_active is true
        and coalesce(u.status, 'Active') = 'Active'
      limit 1;

      if found then
        new.referral_code := referral.referral_code;
        new.invited_by_user_id := referral.user_id;
        new.invited_by_old_user_id := referral.old_user_id;
        new.invited_by_name_snapshot := referral.invited_by_name;
      end if;
    end if;

    select s.capacity, s.is_open, coalesce(s.end_date, s.session_date)
      into session_capacity, session_open, session_last_date
    from public.training_sessions s
    where s.id = new.session_id
    for update;

    if not found or session_open is not true then
      raise exception 'Training session is closed';
    end if;

    if session_last_date is not null and session_last_date < current_date then
      raise exception 'Training session is closed';
    end if;

    if exists (
      select 1
      from public.training_registrations r
      where r.session_id = new.session_id
        and r.source = 'public'
        and lower(btrim(coalesce(r.email, ''))) = normalized_email
      limit 1
    ) then
      raise exception 'Training registration duplicate';
    end if;

    if exists (
      select 1
      from public.training_registrations r
      where r.session_id = new.session_id
        and r.source = 'public'
        and regexp_replace(coalesce(r.nric, ''), '[^0-9]', '', 'g') = normalized_nric
      limit 1
    ) then
      raise exception 'Training registration duplicate';
    end if;

    if coalesce(session_capacity, 0) > 0 then
      select count(*)
        into registration_count
      from public.training_registrations r
      where r.session_id = new.session_id;

      if registration_count >= session_capacity then
        raise exception 'Training session is full';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_training_public_registration_rules() from public;

drop trigger if exists training_public_registration_guard on public.training_registrations;
create trigger training_public_registration_guard
  before insert on public.training_registrations
  for each row
  execute function private.enforce_training_public_registration_rules();

notify pgrst, 'reload schema';
