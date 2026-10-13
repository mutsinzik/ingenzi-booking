// Shared email helper — all Brevo-specific logic lives in this one file.
// Swapping providers later means editing only this function.

interface SendEmailParams {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, toName, subject, html, text }: SendEmailParams): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');

  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Court Bookings';
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  if (!senderEmail) throw new Error('BREVO_SENDER_EMAIL not configured');

  const body: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to, name: toName }],
    subject,
    htmlContent: html,
  };
  if (text) body.textContent = text;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${errText}`);
  }

  const resData = await res.json().catch(() => ({}));
  console.log('Brevo send result:', JSON.stringify(resData));
}

export function formatDateTime(startsAt: string, endsAt: string, timezone: string): string {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const dateStr = new Intl.DateTimeFormat('en-GB', opts).format(start);
    const timeOpts: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const startStr = new Intl.DateTimeFormat('en-GB', timeOpts).format(start);
    const endStr = new Intl.DateTimeFormat('en-GB', timeOpts).format(end);
    return `${dateStr}, ${startStr} – ${endStr}`;
  } catch {
    return `${startsAt} – ${endsAt}`;
  }
}

export function bookingConfirmationHtml(
  courtName: string,
  bookerName: string,
  dateTimeStr: string,
  reference: string,
  cancelUrl: string,
): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 24px; color: #0f5132; margin-bottom: 8px;">Booking Confirmed</h1>
  <p style="font-size: 16px; color: #555; margin-bottom: 24px;">Hi ${escapeHtml(bookerName)}, your court is booked.</p>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr><td style="padding: 8px 0; color: #777; font-size: 14px; width: 120px;">Court</td><td style="padding: 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(courtName)}</td></tr>
    <tr><td style="padding: 8px 0; color: #777; font-size: 14px;">When</td><td style="padding: 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(dateTimeStr)}</td></tr>
  </table>
  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
    <p style="font-size: 13px; color: #555; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">Your reference code</p>
    <p style="font-size: 32px; font-weight: 800; letter-spacing: 0.1em; color: #0f5132; margin: 0;">${escapeHtml(reference)}</p>
  </div>
  <p style="font-size: 14px; color: #555; margin-bottom: 12px;">Save this link — you'll need it to cancel:</p>
  <div style="text-align: center; margin-bottom: 16px;">
    <a href="${escapeAttr(cancelUrl)}" style="display: inline-block; background: #dc2626; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">Cancel this booking</a>
  </div>
  <p style="font-size: 13px; color: #777; word-break: break-all;">${escapeHtml(cancelUrl)}</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
  <p style="font-size: 12px; color: #999;">This is an automated email from the ${escapeHtml(courtName)} booking system.</p>
</body>
</html>`;
}

export function bookingConfirmationText(
  courtName: string,
  bookerName: string,
  dateTimeStr: string,
  reference: string,
  cancelUrl: string,
): string {
  return `Booking Confirmed

Hi ${bookerName}, your court is booked.

Court: ${courtName}
When: ${dateTimeStr}
Reference: ${reference}

Save this link — you'll need it to cancel:
${cancelUrl}

This is an automated email from the ${courtName} booking system.`;
}

export function bookingCancelledHtml(
  courtName: string,
  bookerName: string,
  dateTimeStr: string,
  reference: string,
  siteUrl: string,
): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 24px; color: #991b1b; margin-bottom: 8px;">Booking Cancelled</h1>
  <p style="font-size: 16px; color: #555; margin-bottom: 24px;">Hi ${escapeHtml(bookerName)}, your booking has been cancelled.</p>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr><td style="padding: 8px 0; color: #777; font-size: 14px; width: 120px;">Court</td><td style="padding: 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(courtName)}</td></tr>
    <tr><td style="padding: 8px 0; color: #777; font-size: 14px;">When</td><td style="padding: 8px 0; font-size: 16px;">${escapeHtml(dateTimeStr)}</td></tr>
    <tr><td style="padding: 8px 0; color: #777; font-size: 14px;">Reference</td><td style="padding: 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(reference)}</td></tr>
  </table>
  <p style="font-size: 15px; color: #555; margin-bottom: 16px;">The slot is now available again for others to book.</p>
  <div style="text-align: center;">
    <a href="${escapeAttr(siteUrl)}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">Book a new slot</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
  <p style="font-size: 12px; color: #999;">This is an automated email from the ${escapeHtml(courtName)} booking system.</p>
</body>
</html>`;
}

export function bookingCancelledText(
  courtName: string,
  bookerName: string,
  dateTimeStr: string,
  reference: string,
  siteUrl: string,
): string {
  return `Booking Cancelled

Hi ${bookerName}, your booking has been cancelled.

Court: ${courtName}
When: ${dateTimeStr}
Reference: ${reference}

The slot is now available again for others to book.

Book a new slot: ${siteUrl}

This is an automated email from the ${courtName} booking system.`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
