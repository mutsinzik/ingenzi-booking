import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders, jsonError, jsonOk, getClientIp, checkRateLimit, createServiceClient,
} from '../_shared/cors.ts';
import {
  sendEmail, formatDateTime, bookingConfirmationHtml, bookingConfirmationText,
} from '../_shared/email.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  try {
    const body = await req.json();
    const { name, email, phone, starts_at, ends_at, by_admin } = body as {
      name?: string; email?: string; phone?: string;
      starts_at?: string; ends_at?: string;
      by_admin?: boolean;
    };

    if (!name || !email || !phone || !starts_at || !ends_at) {
      return jsonError(400, 'Missing required fields');
    }

    const ip = getClientIp(req);

    // Admin-created bookings: verify the caller is an authenticated admin via JWT.
    // Without this check, anyone could send by_admin:true to bypass rate limits.
    let isAdmin = false;
    if (by_admin) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return jsonError(401, 'Admin booking requires authentication');
      }
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) {
        return jsonError(401, 'Invalid session');
      }
      const adminClient = createServiceClient();
      const { data: adminCheck } = await adminClient
        .from('admins')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (!adminCheck) {
        return jsonError(403, 'Not authorised to create admin bookings');
      }
      isAdmin = true;
    }

    const supabase = createServiceClient();

    // Rate limit (skip for admin)
    if (!isAdmin) {
      const hourLimit = await checkRateLimit(supabase, ip, 'create_booking_hour', 20, 60);
      if (!hourLimit.allowed) {
        return jsonError(429, hourLimit.message ?? 'Too many bookings. Please try again later.');
      }
      const dayLimit = await checkRateLimit(supabase, ip, 'create_booking_day', 50, 1440);
      if (!dayLimit.allowed) {
        return jsonError(429, dayLimit.message ?? 'Too many bookings today. Please try again tomorrow.');
      }
    }

    // Call create_booking function
    const { data: booking, error: bookingError } = await supabase
      .rpc('create_booking', {
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_starts_at: starts_at,
        p_ends_at: ends_at,
        p_ip: ip,
        p_by_admin: by_admin ?? false,
      })
      .maybeSingle();

    if (bookingError) {
      console.error('create_booking error:', bookingError);
      return jsonError(400, bookingError.message);
    }

    if (!booking) {
      return jsonError(500, 'Could not create booking. Please try again.');
    }

    // Commit first — booking is already saved. Now attempt email.
    let emailSent = true;
    let emailError: string | null = null;
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('court_name, timezone')
        .eq('id', 1)
        .maybeSingle();

      const courtName = settings?.court_name ?? 'Court 1';
      const tz = settings?.timezone ?? 'Africa/Kigali';
      const siteUrl = Deno.env.get('SITE_URL') ?? '';
      const cancelUrl = `${siteUrl}/#/cancel?token=${booking.cancel_token}`;
      const dateTimeStr = formatDateTime(booking.starts_at, booking.ends_at, tz);

      await sendEmail({
        to: booking.booker_email,
        toName: booking.booker_name,
        subject: `Booking confirmed — ${courtName} — ${booking.reference}`,
        html: bookingConfirmationHtml(courtName, booking.booker_name, dateTimeStr, booking.reference, cancelUrl),
        text: bookingConfirmationText(courtName, booking.booker_name, dateTimeStr, booking.reference, cancelUrl),
      });
    } catch (emailErr) {
      console.error('Email send failed (booking still saved):', emailErr);
      emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
      emailSent = false;
    }

    return jsonOk({
      reference: booking.reference,
      cancel_token: booking.cancel_token,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      booker_name: booking.booker_name,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (err) {
    console.error('create-booking error:', err);
    return jsonError(500, 'Something went wrong. Please try again.');
  }
});
