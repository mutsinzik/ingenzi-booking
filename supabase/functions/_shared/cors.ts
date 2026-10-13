export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

interface RateLimitResult {
  allowed: boolean;
  message?: string;
}

/**
 * Rate limit by IP. Windows are hourly or daily.
 * action: e.g. 'create_booking', 'cancel_booking', 'lookup_booking'
 */
export async function checkRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  ip: string,
  action: string,
  limit: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowMinutes * 60 * 1000)) * windowMinutes * 60 * 1000);

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('ip', ip)
    .eq('action', action)
    .eq('window_start', windowStart.toISOString())
    .maybeSingle();

  if (existing && existing.count >= limit) {
    return {
      allowed: false,
      message: `Too many requests. Please try again later.`,
    };
  }

  if (existing) {
    await supabase
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('ip', ip)
      .eq('action', action)
      .eq('window_start', windowStart.toISOString());
  } else {
    await supabase
      .from('rate_limits')
      .insert({ ip, action, window_start: windowStart.toISOString(), count: 1 });
  }

  return { allowed: true };
}

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key, { auth: { persistSession: false } });
}
