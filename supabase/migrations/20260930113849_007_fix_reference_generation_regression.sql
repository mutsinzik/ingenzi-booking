/*
# Fix reference code generation (regression from migration 006)

## Problem
Migration 006 recreated the entire `create_booking` function to fix the
overbooking error message, but inadvertently reverted the reference generation
fix from migration 004. It used `string_to_array('ABC...', '')` which with an
empty delimiter returns the entire string as a single array element, causing
reference codes to be 192 characters long instead of the intended 6.

## Fix
Replace `string_to_array(..., '')` with `regexp_split_to_array(..., '')`
which correctly splits the string into individual characters.

## No data loss
This only modifies the function definition. No tables or data are touched.
*/

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
  v_ref_chars  text[] := regexp_split_to_array('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', '');
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
    raise exception 'The court is closed on %.', to_char(v_start_day, 'Dy DD Mon');
  end if;
  v_start_time := (p_starts_at at time zone tz)::time;
  if v_start_time < v_oh.open_time then
    raise exception 'The court opens at % on %.',
      to_char(v_oh.open_time, 'HH24:MI'), to_char(v_start_day, 'Dy DD Mon');
  end if;

  if v_end_day != v_start_day then
    select * into v_oh from public.operating_hours where day_of_week = extract(dow from v_end_day::timestamp)::int;
    if not v_oh.is_open then
      raise exception 'The court is closed on %.', to_char(v_end_day, 'Dy DD Mon');
    end if;
  end if;
  v_end_time := (p_ends_at at time zone tz)::time;
  if v_end_time != '00:00:00'::time and v_end_time > v_oh.close_time then
    raise exception 'The court closes at % on %.',
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
    raise exception 'This would put you at % hours on % — the limit is % per day. You already have % booked.',
      trim(to_char(v_booked_hrs + v_hours, 'FM999990.9')),
      to_char(v_date, 'Dy DD Mon'),
      trim(to_char(v_max_hrs, 'FM999990.9')),
      trim(to_char(v_booked_hrs, 'FM999990.9'));
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
