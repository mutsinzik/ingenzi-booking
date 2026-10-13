import {
  corsHeaders, jsonError, jsonOk, getClientIp, checkRateLimit, createServiceClient,
} from '../_shared/cors.ts';
import {
  sendEmail, formatDateTime, bookingCancelledHtml, bookingCancelledText,
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
    const { cancel_token } = body as {
      cancel_token?: string;
    };

    if (!cancel_token) {
      return jsonError(400, 'Missing cancellation token');
    }

    const ip = getClientIp(req);

    const supabase = createServiceClient();

    // Rate limit: 10 per hour
    const limit = await checkRateLimit(supabase, ip, 'cancel_booking', 20, 60);
    if (!limit.allowed) {
      return jsonError(429, limit.message ?? 'Too many requests. Please try again later.');
    }

    const { data: booking, error } = await supabase
      .rpc('cancel_booking_by_token', { p_token: cancel_token })
      .maybeSingle();

    if (error) {
      console.error('cancel_booking error:', error);
      return jsonError(400, error.message);
    }

    if (!booking) {
      return jsonError(404, 'No booking found with that cancellation link.');
    }

    // Send cancellation email (swallow failures)
    let emailSent = true;
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('court_name, timezone')
        .eq('id', 1)
        .maybeSingle();

      const courtName = settings?.court_name ?? 'Court 1';
      const tz = settings?.timezone ?? 'Africa/Kigali';
      const siteUrl = Deno.env.get('SITE_URL') ?? '';
      const dateTimeStr = formatDateTime(booking.starts_at, booking.ends_at, tz);

      await sendEmail({
        to: booking.booker_email,
        toName: booking.booker_name,
        subject: `Booking cancelled — ${courtName} — ${booking.reference}`,
        html: bookingCancelledHtml(courtName, booking.booker_name, dateTimeStr, booking.reference, siteUrl),
        text: bookingCancelledText(courtName, booking.booker_name, dateTimeStr, booking.reference, siteUrl),
      });
    } catch (emailErr) {
      console.error('Cancellation email failed (booking still cancelled):', emailErr);
      emailSent = false;
    }

    return jsonOk({
      reference: booking.reference,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      booker_name: booking.booker_name,
      status: booking.status,
      email_sent: emailSent,
    });
  } catch (err) {
    console.error('cancel-booking error:', err);
    return jsonError(500, 'Something went wrong. Please try again.');
  }
});
