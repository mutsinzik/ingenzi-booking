import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Slot = {
  slot_date: string;
  starts_at: string;
  ends_at: string;
  is_available: boolean;
};

export type SlotBooker = {
  starts_at: string;
  booker_name: string;
  booker_phone: string;
};

export type Settings = {
  id: number;
  court_name: string;
  slot_minutes: number;
  max_hours_per_day_per_email: number;
  max_hours_per_booking: number;
  max_days_ahead: number;
  min_advance_minutes: number;
  timezone: string;
};

export type OperatingHours = {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

export type Closure = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  reference: string;
  cancel_token: string;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by_admin: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  created_ip: string | null;
};

export type Admin = {
  user_id: string;
  created_at: string;
};
