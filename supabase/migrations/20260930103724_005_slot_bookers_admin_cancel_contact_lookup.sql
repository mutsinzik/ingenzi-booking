/*
# Three changes: slot booker info, admin cancel permissions, contact-only lookup

## 1. get_slot_bookers function (public, PII-limited)
New function returns booker_name and booker_phone (NOT email) for confirmed bookings
in a date range. Callable by anon so the public calendar can show who booked a slot.
Only returns name and phone — no email, no cancel tokens, no reference codes.

## 2. Fix admin_cancel_booking permissions
Currently granted only to service_role, but the admin frontend calls it as an
authenticated user via the Supabase client. The call fails with permission denied.
Fix: grant execute to authenticated, and add an is_admin() guard inside the function
so only actual admins can use it.

## 3. lookup_bookings_by_contact function
New function that finds bookings by email or phone alone (no reference required).
Returns reference, starts_at, ends_at, status, cancel_token so the user can cancel.
Service role only — called from the lookup-booking edge function.

## No data loss
No tables or columns are dropped or renamed. Only function definitions change.
*/

-- 1. get_slot_bookers: public function returning booker name + phone for booked slots
CREATE OR REPLACE FUNCTION public.get_slot_bookers(p_start date, p_end date)
RETURNS TABLE (
  starts_at    timestamptz,
  booker_name  text,
  booker_phone text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_end < p_start THEN
    RAISE EXCEPTION 'End date before start date';
  END IF;
  IF p_end - p_start > 62 THEN
    RAISE EXCEPTION 'Date range too wide (max 62 days)';
  END IF;

  RETURN QUERY
  SELECT b.starts_at, b.booker_name, b.booker_phone
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND b.starts_at >= p_start::timestamp
    AND b.starts_at < (p_end + interval '1 day')::timestamp
  ORDER BY b.starts_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_slot_bookers(date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_slot_bookers(date, date) TO anon, authenticated;

-- 2. Fix admin_cancel_booking: grant to authenticated with is_admin() guard
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking public.bookings;
  v_tz      text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised. Admin access required.';
  END IF;

  SELECT timezone INTO v_tz FROM public.settings WHERE id = 1;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT found THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'This booking has already been cancelled.';
  END IF;

  UPDATE public.bookings
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin'
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

  INSERT INTO public.slot_changes (changed_date)
    VALUES (date_trunc('day', v_booking.starts_at AT TIME ZONE v_tz)::date);

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid) TO authenticated, service_role;

-- 3. lookup_bookings_by_contact: find bookings by email or phone alone
CREATE OR REPLACE FUNCTION public.lookup_bookings_by_contact(p_contact text)
RETURNS SETOF public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND (
      lower(b.booker_email) = lower(trim(p_contact))
      OR regexp_replace(b.booker_phone, '\D', '', 'g')
          = regexp_replace(p_contact, '\D', '', 'g')
    )
  ORDER BY b.starts_at DESC
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_bookings_by_contact(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_bookings_by_contact(text) TO service_role;
