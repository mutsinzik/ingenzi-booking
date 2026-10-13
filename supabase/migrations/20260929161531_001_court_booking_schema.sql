/*
# Court Booking System — Schema, RLS, and Database Functions

## Overview
This migration creates the complete database layer for a single-court booking system
where anonymous members of the public can check availability, book slots, and cancel
without creating accounts. One admin manages everything via Supabase email/password auth.

## Tables Created
1. `settings` — Single-row configuration table (court name, slot length, limits, timezone)
2. `operating_hours` — Opening hours per weekday (0=Sunday..6=Saturday)
3. `closures` — One-off closures (maintenance, holidays, tournaments)
4. `bookings` — Booking records with PII (name, email, phone). Protected: anon has NO access.
5. `admins` — Maps auth.users to admin privilege
6. `slot_changes` — PII-free change feed for Realtime (date-only, no customer data)
7. `rate_limits` — IP-based rate limiting for Edge Functions

## Security
- RLS enabled on ALL tables
- `bookings`: ONLY admin (authenticated via is_admin()) can read/write. NO anon policy.
- `settings`, `operating_hours`, `closures`, `slot_changes`: public read (anon+authenticated), admin write
- `admins`, `rate_limits`: no policies — service role only
- `get_availability()` function: SECURITY DEFINER, callable by anon. Returns only slot times + free/busy boolean. No PII.
- `create_booking()`, `cancel_booking_by_token()`, `lookup_booking()`: SECURITY DEFINER, service-role only

## Critical Constraint
- `bookings_no_overlap`: EXCLUDE USING GIST exclusion constraint prevents overlapping confirmed bookings at the database level.

## Functions
1. `get_availability(p_start, p_end)` — public availability check
2. `create_booking(...)` — validates and creates a booking
3. `cancel_booking_by_token(p_token)` — cancels via cancel_token
4. `lookup_booking(p_reference, p_contact)` — looks up booking by reference + email/phone
5. `is_admin()` — helper to check admin privilege
*/

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.settings (
  id                          int primary key default 1 check (id = 1),
  court_name                  text not null default 'Court 1',
  slot_minutes                int  not null default 60  check (slot_minutes between 15 and 240),
  max_hours_per_day_per_email int  not null default 4   check (max_hours_per_day_per_email between 1 and 24),
  max_hours_per_booking       int  not null default 4   check (max_hours_per_booking between 1 and 24),
  max_days_ahead              int  not null default 14  check (max_days_ahead between 1 and 365),
  min_advance_minutes         int  not null default 60,
  timezone                    text not null default 'Africa/Kigali'
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.operating_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_open     boolean not null default true,
  open_time   time    not null default '06:00',
  close_time  time    not null default '22:00',
  check (close_time > open_time)
);
insert into public.operating_hours (day_of_week) values (0),(1),(2),(3),(4),(5),(6)
  on conflict (day_of_week) do nothing;

create table if not exists public.closures (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  cancel_token  uuid not null unique default gen_random_uuid(),
  booker_name   text not null check (length(trim(booker_name)) between 2 and 100),
  booker_email  text not null check (booker_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  booker_phone  text not null check (length(regexp_replace(booker_phone, '\D', '', 'g')) between 9 and 15),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_by_admin boolean not null default false,
  cancelled_at  timestamptz,
  cancelled_by  text check (cancelled_by in ('booker','admin')),
  created_at    timestamptz not null default now(),
  created_ip    inet,
  check (ends_at > starts_at)
);

alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'confirmed');

create index if not exists bookings_starts_at_idx on public.bookings (starts_at) where status = 'confirmed';
create index if not exists bookings_email_idx on public.bookings (lower(booker_email));

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.slot_changes (
  id           bigserial primary key,
  changed_date date not null,
  changed_at   timestamptz not null default now()
);

create table if not exists public.rate_limits (
  ip        inet not null,
  action    text not null,
  window_start timestamptz not null,
  count     int not null default 1,
  primary key (ip, action, window_start)
);

-- ============ RLS ============
alter table public.settings        enable row level security;
alter table public.operating_hours enable row level security;
alter table public.closures        enable row level security;
alter table public.bookings        enable row level security;
alter table public.admins          enable row level security;
alter table public.slot_changes    enable row level security;
alter table public.rate_limits     enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists bookings_admin_all on public.bookings;
create policy bookings_admin_all on public.bookings
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists hours_public_read on public.operating_hours;
create policy hours_public_read on public.operating_hours for select to anon, authenticated using (true);

drop policy if exists closures_public_read on public.closures;
create policy closures_public_read on public.closures for select to anon, authenticated using (true);

drop policy if exists settings_public_read on public.settings;
create policy settings_public_read on public.settings for select to anon, authenticated using (true);

drop policy if exists changes_public_read on public.slot_changes;
create policy changes_public_read on public.slot_changes for select to anon, authenticated using (true);

drop policy if exists hours_admin_write on public.operating_hours;
create policy hours_admin_write on public.operating_hours for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists closures_admin_write on public.closures;
create policy closures_admin_write on public.closures for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for update to authenticated using (is_admin()) with check (is_admin());

alter publication supabase_realtime add table public.slot_changes;

-- ============ AVAILABILITY FUNCTION (public, PII-free) ============
create or replace function public.get_availability(p_start date, p_end date)
returns table (
  slot_date    date,
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_available boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  s  public.settings%rowtype;
  tz text;
begin
  select * into s from public.settings where id = 1;
  tz := s.timezone;

  if p_end < p_start then
    raise exception 'End date before start date';
  end if;
  if p_end - p_start > 62 then
    raise exception 'Date range too wide (max 62 days)';
  end if;

  return query
  with days as (
    select d::date as day
    from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  ),
  windows as (
    select
      days.day,
      ((days.day + oh.open_time)  at time zone tz) as win_start,
      ((days.day + oh.close_time) at time zone tz) as win_end
    from days
    join public.operating_hours oh
      on oh.day_of_week = extract(dow from days.day)::int
    where oh.is_open
  ),
  slots as (
    select
      w.day,
      gs as slot_start,
      gs + make_interval(mins => s.slot_minutes) as slot_end
    from windows w
    cross join lateral generate_series(
      w.win_start,
      w.win_end - make_interval(mins => s.slot_minutes),
      make_interval(mins => s.slot_minutes)
    ) gs
  )
  select
    sl.day,
    sl.slot_start,
    sl.slot_end,
    (
      not exists (
        select 1 from public.bookings b
        where b.status = 'confirmed'
          and tstzrange(b.starts_at, b.ends_at, '[)')
              && tstzrange(sl.slot_start, sl.slot_end, '[)')
      )
      and not exists (
        select 1 from public.closures c
        where tstzrange(c.starts_at, c.ends_at, '[)')
              && tstzrange(sl.slot_start, sl.slot_end, '[)')
      )
      and sl.slot_start > now() + make_interval(mins => s.min_advance_minutes)
    ) as is_available
  from slots sl
  order by sl.slot_start;
end;
$$;

revoke all on function public.get_availability(date, date) from public;
grant execute on function public.get_availability(date, date) to anon, authenticated;

-- ============ BOOKING FUNCTIONS (service role only) ============

create or replace function public.create_booking(
  p_name       text,
  p_email      text,
  p_phone      text,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_ip         inet,
  p_by_admin   boolean default false
)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s            public.settings%rowtype;
  tz           text;
  v_ref        text;
  v_duration   int;
  v_hours      numeric;
  v_date       date;
  v_booked_hrs numeric;
  v_max_hrs    numeric;
  v_result     public.bookings;
  v_ref_chars  text[] := string_to_array('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', '');
  v_attempts   int := 0;
  v_start_day  date;
  v_end_day    date;
  v_start_time time;
  v_end_time   time;
  v_oh         public.operating_hours%rowtype;
begin
  select * into s from public.settings where id = 1;
  tz := s.timezone;

  -- 1. Duration must be whole number of slot_minutes, at most max_hours_per_booking
  v_duration := extract(epoch from (p_ends_at - p_starts_at))::int / 60;
  if v_duration <= 0 then
    raise exception 'End time must be after start time';
  end if;
  if v_duration % s.slot_minutes <> 0 then
    raise exception 'Booking duration must be a multiple of % minutes', s.slot_minutes;
  end if;
  v_hours := v_duration / 60.0;
  if v_hours > s.max_hours_per_booking then
    raise exception 'This booking is too long. The maximum is % hours per booking.', s.max_hours_per_booking;
  end if;

  -- 2. Minimum advance (skip for admin walk-ins)
  if not p_by_admin then
    if p_starts_at < now() + make_interval(mins => s.min_advance_minutes) then
      raise exception 'This slot is too soon. Please choose a time at least % minutes from now.', s.min_advance_minutes;
    end if;
  end if;

  -- 3. Max days ahead (skip for admin)
  if not p_by_admin then
    if p_starts_at > now() + make_interval(days => s.max_days_ahead) then
      raise exception 'This slot is too far ahead. You can book up to % days in advance.', s.max_days_ahead;
    end if;
  end if;

  -- 4. Must fall inside operating hours
  v_start_day := date_trunc('day', p_starts_at at time zone tz)::date;
  v_end_day   := date_trunc('day', (p_ends_at - interval '1 microsecond') at time zone tz)::date;

  select * into v_oh from public.operating_hours where day_of_week = extract(dow from v_start_day::timestamp)::int;
  if not v_oh.is_open then
    raise exception 'The court is closed on %s.', to_char(v_start_day, 'Dy DD Mon');
  end if;
  v_start_time := (p_starts_at at time zone tz)::time;
  if v_start_time < v_oh.open_time then
    raise exception 'The court opens at %s on %s.',
      to_char(v_oh.open_time, 'HH24:MI'), to_char(v_start_day, 'Dy DD Mon');
  end if;

  if v_end_day != v_start_day then
    select * into v_oh from public.operating_hours where day_of_week = extract(dow from v_end_day::timestamp)::int;
    if not v_oh.is_open then
      raise exception 'The court is closed on %s.', to_char(v_end_day, 'Dy DD Mon');
    end if;
  end if;
  v_end_time := (p_ends_at at time zone tz)::time;
  if v_end_time != '00:00:00'::time and v_end_time > v_oh.close_time then
    raise exception 'The court closes at %s on %s.',
      to_char(v_oh.close_time, 'HH24:MI'), to_char(v_end_day, 'Dy DD Mon');
  end if;

  -- 5. Must not overlap any closure
  if exists (
    select 1 from public.closures c
    where tstzrange(c.starts_at, c.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'The court is closed during that time. Please check the calendar for closures.';
  end if;

  -- 6. Per-email daily limit (computed in configured timezone)
  v_date := date_trunc('day', p_starts_at at time zone tz)::date;
  v_max_hrs := s.max_hours_per_day_per_email;

  select coalesce(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600), 0)
    into v_booked_hrs
  from public.bookings b
  where b.status = 'confirmed'
    and lower(b.booker_email) = lower(p_email)
    and date_trunc('day', b.starts_at at time zone tz)::date = v_date;

  if v_booked_hrs + v_hours > v_max_hrs then
    raise exception 'This would put you at % hours on %s — the limit is % per day. You already have % booked.',
      (v_booked_hrs + v_hours), to_char(v_date, 'Dy DD Mon'), v_max_hrs, v_booked_hrs;
  end if;

  -- 7. Generate reference and insert (retry on collision)
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'Could not generate a unique reference. Please try again.';
    end if;
    v_ref := 'CRT-' || (
      select string_agg(v_ref_chars[1 + floor(random() * array_length(v_ref_chars, 1))::int], '')
      from generate_series(1, 6)
    );

    begin
      insert into public.bookings (
        reference, booker_name, booker_email, booker_phone,
        starts_at, ends_at, created_by_admin, created_ip
      )
      values (
        v_ref, p_name, p_email, p_phone,
        p_starts_at, p_ends_at, p_by_admin, p_ip
      )
      returning * into v_result;

      insert into public.slot_changes (changed_date) values (v_date);
      exit;
    exception
      when unique_violation then
        if v_result is null then
          continue;
        end if;
        raise;
      when exclusion_violation then
        raise exception 'That slot was just taken by someone else. Please pick another.';
    end;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.create_booking(text, text, text, timestamptz, timestamptz, inet, boolean) from public, anon, authenticated;
grant execute on function public.create_booking(text, text, text, timestamptz, timestamptz, inet, boolean) to service_role;

-- cancel_booking_by_token
create or replace function public.cancel_booking_by_token(p_token uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_tz      text;
begin
  select timezone into v_tz from public.settings where id = 1;
  select * into v_booking from public.bookings where cancel_token = p_token;
  if not found then
    raise exception 'No booking found with that cancellation link.';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'This booking has already been cancelled.';
  end if;

  if v_booking.starts_at <= now() then
    raise exception 'This booking has already started and can no longer be cancelled.';
  end if;

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'booker'
    where id = v_booking.id
    returning * into v_booking;

  insert into public.slot_changes (changed_date)
    values (date_trunc('day', v_booking.starts_at at time zone v_tz)::date);

  return v_booking;
end;
$$;

revoke all on function public.cancel_booking_by_token(uuid) from public, anon, authenticated;
grant execute on function public.cancel_booking_by_token(uuid) to service_role;

-- lookup_booking
create or replace function public.lookup_booking(p_reference text, p_contact text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_ref     text;
begin
  v_ref := upper(trim(p_reference));
  if v_ref not like 'CRT-%' then
    v_ref := 'CRT-' || v_ref;
  end if;

  select * into v_booking
  from public.bookings b
  where b.reference = v_ref
    and (
      lower(b.booker_email) = lower(trim(p_contact))
      or regexp_replace(b.booker_phone, '\D', '', 'g')
          = regexp_replace(p_contact, '\D', '', 'g')
    );

  if not found then
    return null;
  end if;

  return v_booking;
end;
$$;

revoke all on function public.lookup_booking(text, text) from public, anon, authenticated;
grant execute on function public.lookup_booking(text, text) to service_role;