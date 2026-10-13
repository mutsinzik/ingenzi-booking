/*
# Add admin_cancel_booking function

Adds a function for admins to cancel bookings, setting cancelled_by = 'admin'.
Service role only — called from Edge Functions or admin RPC.
*/

create or replace function public.admin_cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_tz      text;
begin
  select timezone into v_tz from public.settings where id = 1;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.';
  end if;

  if v_booking.status = 'cancelled' then
    raise exception 'This booking has already been cancelled.';
  end if;

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin'
    where id = p_booking_id
    returning * into v_booking;

  insert into public.slot_changes (changed_date)
    values (date_trunc('day', v_booking.starts_at at time zone v_tz)::date);

  return v_booking;
end;
$$;

revoke all on function public.admin_cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_booking(uuid) to service_role;