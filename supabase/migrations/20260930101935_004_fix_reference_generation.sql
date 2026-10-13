/*
# Fix reference code generation

## Problem
The `create_booking` function used `string_to_array('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', '')`
to split the character pool into individual characters. But `string_to_array` with an empty
delimiter returns the ENTIRE string as a single array element, rather than splitting into
individual characters. This caused `v_ref_chars[1 + floor(random() * 1)]` to always return
the full 32-character string, producing reference codes like
`CRT-ABCDEFGHJKLMNPQRSTUVWXYZ23456789ABCDEFGHJKLMNPQRSTUVWXYZ23456789...` (192 chars)
instead of the intended `CRT-XXXXXX` (6 random characters).

## Fix
Replace `string_to_array(..., '')` with `regexp_split_to_array(..., '')` which correctly
splits a string into individual characters.

## No data loss
This only modifies the function definition. No tables or data are touched.
*/

CREATE OR REPLACE FUNCTION public.create_booking(
  p_name       text,
  p_email      text,
  p_phone      text,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_ip         inet,
  p_by_admin   boolean default false
)
RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
BEGIN
  SELECT * INTO s FROM public.settings WHERE id = 1;
  tz := s.timezone;

  -- 1. Duration must be whole number of slot_minutes, at most max_hours_per_booking
  v_duration := extract(epoch FROM (p_ends_at - p_starts_at))::int / 60;
  IF v_duration <= 0 THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;
  IF v_duration % s.slot_minutes <> 0 THEN
    RAISE EXCEPTION 'Booking duration must be a multiple of % minutes', s.slot_minutes;
  END IF;
  v_hours := v_duration / 60.0;
  IF v_hours > s.max_hours_per_booking THEN
    RAISE EXCEPTION 'This booking is too long. The maximum is % hours per booking.', s.max_hours_per_booking;
  END IF;

  -- 2. Minimum advance (skip for admin walk-ins)
  IF NOT p_by_admin THEN
    IF p_starts_at < now() + make_interval(mins => s.min_advance_minutes) THEN
      RAISE EXCEPTION 'This slot is too soon. Please choose a time at least % minutes from now.', s.min_advance_minutes;
    END IF;
  END IF;

  -- 3. Max days ahead (skip for admin)
  IF NOT p_by_admin THEN
    IF p_starts_at > now() + make_interval(days => s.max_days_ahead) THEN
      RAISE EXCEPTION 'This slot is too far ahead. You can book up to % days in advance.', s.max_days_ahead;
    END IF;
  END IF;

  -- 4. Must fall inside operating hours
  v_start_day := date_trunc('day', p_starts_at AT TIME ZONE tz)::date;
  v_end_day   := date_trunc('day', (p_ends_at - interval '1 microsecond') AT TIME ZONE tz)::date;

  SELECT * INTO v_oh FROM public.operating_hours WHERE day_of_week = extract(dow FROM v_start_day::timestamp)::int;
  IF NOT v_oh.is_open THEN
    RAISE EXCEPTION 'The court is closed on %s.', to_char(v_start_day, 'Dy DD Mon');
  END IF;
  v_start_time := (p_starts_at AT TIME ZONE tz)::time;
  IF v_start_time < v_oh.open_time THEN
    RAISE EXCEPTION 'The court opens at %s on %s.',
      to_char(v_oh.open_time, 'HH24:MI'), to_char(v_start_day, 'Dy DD Mon');
  END IF;

  IF v_end_day != v_start_day THEN
    SELECT * INTO v_oh FROM public.operating_hours WHERE day_of_week = extract(dow FROM v_end_day::timestamp)::int;
    IF NOT v_oh.is_open THEN
      RAISE EXCEPTION 'The court is closed on %s.', to_char(v_end_day, 'Dy DD Mon');
    END IF;
  END IF;
  v_end_time := (p_ends_at AT TIME ZONE tz)::time;
  IF v_end_time != '00:00:00'::time AND v_end_time > v_oh.close_time THEN
    RAISE EXCEPTION 'The court closes at %s on %s.',
      to_char(v_oh.close_time, 'HH24:MI'), to_char(v_end_day, 'Dy DD Mon');
  END IF;

  -- 5. Must not overlap any closure
  IF EXISTS (
    SELECT 1 FROM public.closures c
    WHERE tstzrange(c.starts_at, c.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'The court is closed during that time. Please check the calendar for closures.';
  END IF;

  -- 6. Per-email daily limit (computed in configured timezone)
  v_date := date_trunc('day', p_starts_at AT TIME ZONE tz)::date;
  v_max_hrs := s.max_hours_per_day_per_email;

  SELECT coalesce(sum(extract(epoch FROM (b.ends_at - b.starts_at)) / 3600), 0)
    INTO v_booked_hrs
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND lower(b.booker_email) = lower(p_email)
    AND date_trunc('day', b.starts_at AT TIME ZONE tz)::date = v_date;

  IF v_booked_hrs + v_hours > v_max_hrs THEN
    RAISE EXCEPTION 'This would put you at % hours on %s — the limit is % per day. You already have % booked.',
      (v_booked_hrs + v_hours), to_char(v_date, 'Dy DD Mon'), v_max_hrs, v_booked_hrs;
  END IF;

  -- 7. Generate reference and insert (retry on collision)
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique reference. Please try again.';
    END IF;
    v_ref := 'CRT-' || (
      SELECT string_agg(v_ref_chars[1 + floor(random() * array_length(v_ref_chars, 1))::int], '')
      FROM generate_series(1, 6)
    );

    BEGIN
      INSERT INTO public.bookings (
        reference, booker_name, booker_email, booker_phone,
        starts_at, ends_at, created_by_admin, created_ip
      )
      VALUES (
        v_ref, p_name, p_email, p_phone,
        p_starts_at, p_ends_at, p_by_admin, p_ip
      )
      RETURNING * INTO v_result;

      INSERT INTO public.slot_changes (changed_date) VALUES (v_date);
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_result IS NULL THEN
          CONTINUE;
        END IF;
        RAISE;
      WHEN exclusion_violation THEN
        RAISE EXCEPTION 'That slot was just taken by someone else. Please pick another.';
    END;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(text, text, text, timestamptz, timestamptz, inet, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(text, text, text, timestamptz, timestamptz, inet, boolean) TO service_role;
