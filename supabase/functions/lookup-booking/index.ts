import {
  corsHeaders, jsonError, jsonOk, getClientIp, checkRateLimit, createServiceClient,
} from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  try {
    const body = await req.json();
    const { reference, contact } = body as {
      reference?: string; contact?: string;
    };

    if (!contact) {
      return jsonError(400, 'Email or phone is required');
    }

    const ip = getClientIp(req);

    const supabase = createServiceClient();

    // Rate limit: 5 per 15 minutes (this endpoint is guessable)
    const limit = await checkRateLimit(supabase, ip, 'lookup_booking', 20, 15);
    if (!limit.allowed) {
      return jsonError(429, limit.message ?? 'Too many lookups. Please try again later.');
    }

    // If reference provided, do exact lookup
    if (reference && reference.trim()) {
      const { data: booking, error } = await supabase
        .rpc('lookup_booking', { p_reference: reference, p_contact: contact })
        .maybeSingle();

      if (error) {
        console.error('lookup_booking error:', error);
        return jsonError(500, 'Something went wrong. Please try again.');
      }

      if (!booking) {
        return jsonError(404, 'No booking found with those details');
      }

      const siteUrl = Deno.env.get('SITE_URL') ?? '';
      return jsonOk({
        bookings: [{
          reference: booking.reference,
          cancel_token: booking.cancel_token,
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          booker_name: booking.booker_name,
          status: booking.status,
          cancel_url: `${siteUrl}/#/cancel?token=${booking.cancel_token}`,
        }],
      });
    }

    // No reference — search by contact only
    const { data: bookings, error } = await supabase
      .rpc('lookup_bookings_by_contact', { p_contact: contact })
      .limit(10);

    if (error) {
      console.error('lookup_bookings_by_contact error:', error);
      return jsonError(500, 'Something went wrong. Please try again.');
    }

    if (!bookings || bookings.length === 0) {
      return jsonError(404, 'No bookings found with that email or phone');
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? '';
    return jsonOk({
      bookings: bookings.map((b: Record<string, unknown>) => ({
        reference: b.reference as string,
        cancel_token: b.cancel_token as string,
        starts_at: b.starts_at as string,
        ends_at: b.ends_at as string,
        booker_name: b.booker_name as string,
        status: b.status as string,
        cancel_url: `${siteUrl}/#/cancel?token=${b.cancel_token}`,
      })),
    });
  } catch (err) {
    console.error('lookup-booking error:', err);
    return jsonError(500, 'Something went wrong. Please try again.');
  }
});
