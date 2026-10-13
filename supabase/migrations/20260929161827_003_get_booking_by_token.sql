/*
# Add get_booking_by_token function

Allows the /cancel page to show booking details before the user confirms cancellation.
The cancel_token is a secret known only to the booker (from their email/confirmation page),
so this is safe to expose. Returns limited info: reference, name, dates, status.
No email or phone is returned.
*/

create or replace function public.get_booking_by_token(p_token uuid)
returns table (
  reference     text,
  booker_name   text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        text,
  cancelled_at  timestamptz,
  cancelled_by  text
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select b.reference, b.booker_name, b.starts_at, b.ends_at,
         b.status, b.cancelled_at, b.cancelled_by
  from public.bookings b
  where b.cancel_token = p_token;
end;
$$;

revoke all on function public.get_booking_by_token(uuid) from public;
grant execute on function public.get_booking_by_token(uuid) to anon, authenticated;