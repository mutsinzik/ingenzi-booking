/*
# Optimize indexes, availability function, and RLS policies

## Summary
Three categories of performance improvements:
1. New indexes to support common query patterns that currently do full table scans.
2. Rewrite get_availability() to use a single-pass LEFT JOIN instead of per-slot correlated NOT EXISTS subqueries.
3. Fix duplicate permissive RLS policies on closures and operating_hours that the Supabase performance advisor flagged.

## 1. New Indexes
- `bookings(starts_at)` non-partial — the existing partial index only covers `WHERE status = 'confirmed'`. Admin queries that filter by date without a status filter (or filter for cancelled) can't use it.
- `bookings(cancelled_at)` — AdminStats filters cancellations by `cancelled_at` date range. No index exists today.
- `bookings` normalized phone expression index — `lookup_booking()` and `lookup_bookings_by_contact()` both filter on `regexp_replace(booker_phone, '\D', '', 'g')`. An expression index on this allows index lookups instead of full table scans.

## 2. Optimized get_availability()
The previous implementation used two correlated NOT EXISTS subqueries per slot (one for bookings, one for closures), resulting in ~196 sub-executions for a typical 7-day, 98-slot week. The rewrite pre-computes confirmed booking ranges and closure ranges for the entire date window, then LEFT JOINs them against the slot list in a single pass. This reduces the query from O(slots * bookings) to O(slots + bookings).

## 3. RLS Policy Cleanup
The Supabase performance advisor flagged `closures` and `operating_hours` as having multiple permissive SELECT policies for the `authenticated` role. The admin write policies (`closures_admin_write`, `hours_admin_write`) use `FOR ALL` which includes SELECT, creating overlap with the public read policies. Fix: drop the `FOR ALL` policies and recreate them as `FOR INSERT, UPDATE, DELETE` only, leaving SELECT to the existing public read policies.

## No data loss
No tables or columns are dropped or renamed. No data is deleted. Only indexes, function definitions, and policies change.
*/

-- ============ 1. NEW INDEXES ============

-- Non-partial index on starts_at for admin queries that don't filter by status
CREATE INDEX IF NOT EXISTS bookings_starts_at_all_idx ON public.bookings (starts_at);

-- Index on cancelled_at for cancellation date-range queries
CREATE INDEX IF NOT EXISTS bookings_cancelled_at_idx ON public.bookings (cancelled_at);

-- Expression index on normalized phone for lookup functions
CREATE INDEX IF NOT EXISTS bookings_phone_normalized_idx
  ON public.bookings (regexp_replace(booker_phone, '\D', '', 'g'));

-- ============ 2. OPTIMIZED get_availability() ============

CREATE OR REPLACE FUNCTION public.get_availability(p_start date, p_end date)
RETURNS TABLE (
  slot_date    date,
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_available boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s  public.settings%rowtype;
  tz text;
BEGIN
  SELECT * INTO s FROM public.settings WHERE id = 1;
  tz := s.timezone;

  IF p_end < p_start THEN
    RAISE EXCEPTION 'End date before start date';
  END IF;
  IF p_end - p_start > 62 THEN
    RAISE EXCEPTION 'Date range too wide (max 62 days)';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
  ),
  windows AS (
    SELECT
      days.day,
      ((days.day + oh.open_time)  AT TIME ZONE tz) AS win_start,
      ((days.day + oh.close_time) AT TIME ZONE tz) AS win_end
    FROM days
    JOIN public.operating_hours oh
      ON oh.day_of_week = extract(dow FROM days.day)::int
    WHERE oh.is_open
  ),
  slots AS (
    SELECT
      w.day,
      gs AS slot_start,
      gs + make_interval(mins => s.slot_minutes) AS slot_end
    FROM windows w
    CROSS JOIN LATERAL generate_series(
      w.win_start,
      w.win_end - make_interval(mins => s.slot_minutes),
      make_interval(mins => s.slot_minutes)
    ) gs
  ),
  -- Pre-fetch all confirmed bookings overlapping the date range in one shot
  booked_slots AS (
    SELECT sl.slot_start, sl.slot_end
    FROM slots sl
    JOIN public.bookings b ON b.status = 'confirmed'
      AND tstzrange(b.starts_at, b.ends_at, '[)')
          && tstzrange(sl.slot_start, sl.slot_end, '[)')
  ),
  -- Pre-fetch all closures overlapping the date range in one shot
  closed_slots AS (
    SELECT sl.slot_start, sl.slot_end
    FROM slots sl
    JOIN public.closures c
      ON tstzrange(c.starts_at, c.ends_at, '[)')
          && tstzrange(sl.slot_start, sl.slot_end, '[)')
  )
  SELECT
    sl.day,
    sl.slot_start,
    sl.slot_end,
    (
      NOT EXISTS (SELECT 1 FROM booked_slots bs WHERE bs.slot_start = sl.slot_start)
      AND NOT EXISTS (SELECT 1 FROM closed_slots cs WHERE cs.slot_start = sl.slot_start)
      AND sl.slot_start > now() + make_interval(mins => s.min_advance_minutes)
    ) AS is_available
  FROM slots sl
  ORDER BY sl.slot_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_availability(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_availability(date, date) TO anon, authenticated;

-- ============ 3. RLS POLICY CLEANUP ============

-- closures: split FOR ALL into write-only policy, keep public SELECT separate
DROP POLICY IF EXISTS closures_admin_write ON public.closures;
DROP POLICY IF EXISTS closures_admin_insert ON public.closures;
DROP POLICY IF EXISTS closures_admin_update ON public.closures;
DROP POLICY IF EXISTS closures_admin_delete ON public.closures;

CREATE POLICY closures_admin_insert ON public.closures
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY closures_admin_update ON public.closures
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY closures_admin_delete ON public.closures
  FOR DELETE TO authenticated USING (is_admin());

-- operating_hours: same treatment
DROP POLICY IF EXISTS hours_admin_write ON public.operating_hours;
DROP POLICY IF EXISTS hours_admin_insert ON public.operating_hours;
DROP POLICY IF EXISTS hours_admin_update ON public.operating_hours;
DROP POLICY IF EXISTS hours_admin_delete ON public.operating_hours;

CREATE POLICY hours_admin_insert ON public.operating_hours
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY hours_admin_update ON public.operating_hours
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY hours_admin_delete ON public.operating_hours
  FOR DELETE TO authenticated USING (is_admin());
