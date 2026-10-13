import { supabase, type Slot, type SlotBooker } from './supabase';

export async function fetchAvailability(
  startDate: string,
  endDate: string,
): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('get_availability', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) throw error;
  if (!data) return [];
  return data as Slot[];
}

export async function fetchSlotBookers(
  startDate: string,
  endDate: string,
): Promise<Map<string, SlotBooker>> {
  const { data, error } = await supabase.rpc('get_slot_bookers', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) throw error;
  const map = new Map<string, SlotBooker>();
  for (const row of (data ?? []) as SlotBooker[]) {
    map.set(row.starts_at, row);
  }
  return map;
}

export type BookingResponse = {
  reference: string;
  cancel_token: string;
  starts_at: string;
  ends_at: string;
  booker_name: string;
  email_sent: boolean;
  email_error: string | null;
};

export async function createBooking(params: {
  name: string;
  email: string;
  phone: string;
  starts_at: string;
  ends_at: string;
}): Promise<BookingResponse> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-booking`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? 'Booking failed. Please try again.');
  }

  if (!data.reference || !data.cancel_token) {
    throw new Error('Unexpected response from server. Please try again.');
  }

  return data as BookingResponse;
}

export async function cancelBooking(
  cancelToken: string,
): Promise<{
  reference: string;
  starts_at: string;
  ends_at: string;
  booker_name: string;
  status: string;
  email_sent: boolean;
}> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-booking`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cancel_token: cancelToken,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? 'Cancellation failed. Please try again.');
  }

  return data;
}

export type LookupResultItem = {
  reference: string;
  cancel_token: string;
  starts_at: string;
  ends_at: string;
  booker_name: string;
  status: string;
  cancel_url: string;
};

export type LookupResult = {
  bookings: LookupResultItem[];
};

export async function lookupBooking(
  reference: string | null,
  contact: string,
): Promise<LookupResult> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-booking`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reference: reference ?? '',
      contact,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? 'No booking found with those details');
  }

  return data as LookupResult;
}

export type BookingByToken = {
  reference: string;
  booker_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

export async function fetchBookingByToken(token: string): Promise<BookingByToken | null> {
  const { data, error } = await supabase
    .rpc('get_booking_by_token', { p_token: token });

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as BookingByToken;
}

export async function adminCreateBooking(params: {
  name: string;
  email: string;
  phone: string;
  starts_at: string;
  ends_at: string;
}): Promise<BookingResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    throw new Error('You must be signed in as admin to create bookings.');
  }

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-booking`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...params, by_admin: true }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? 'Booking failed. Please try again.');
  }

  return data as BookingResponse;
}
