-- `current_time` is a PostgreSQL special expression (time of day), so it
-- must not be used as the PL/pgSQL timestamp variable for this function.
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
  v_now timestamptz := clock_timestamp();
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
  where window_start < v_now - interval '2 hours';

  window_start_10m := to_timestamp(floor(extract(epoch from v_now) / 600) * 600);
  window_start_1h := to_timestamp(floor(extract(epoch from v_now) / 3600) * 3600);
  window_start_1m := to_timestamp(floor(extract(epoch from v_now) / 60) * 60);

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('ip10:' || p_ip_hash, window_start_10m, 600, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = v_now
  returning request_count into ip_10m_count;

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('ip60:' || p_ip_hash, window_start_1h, 3600, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = v_now
  returning request_count into ip_1h_count;

  insert into public.training_signup_rate_limits(bucket_key, window_start, window_seconds, request_count)
  values ('session60:' || p_session_id::text, window_start_1m, 60, 1)
  on conflict (bucket_key, window_start, window_seconds)
  do update set request_count = public.training_signup_rate_limits.request_count + 1, updated_at = v_now
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
