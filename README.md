# Court Booking System

A single-court booking system where anonymous members of the public check
availability, book slots, and cancel — without ever creating an account. One
admin logs in to manage everything.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres, Edge Functions, Realtime)
- **Email:** Brevo (transactional email)
- **Bot protection:** Cloudflare Turnstile

## Security model

The security design is the most important part of this app. Read these before
modifying anything:

1. **Anonymous users never read the `bookings` table.** The Supabase anon key
   is public — it ships in the frontend bundle. There is no `anon` SELECT
   policy on `bookings`. Public availability comes from a `SECURITY DEFINER`
   function (`get_availability`) that returns only times and a free/busy
   boolean — no names, no contact details.

2. **All writes go through Edge Functions using the service role key.** The
   `anon` role has no INSERT, UPDATE, or DELETE on any table. Client-side
   validation is cosmetic — the server is the authority.

3. **Brevo API key and Turnstile secret live only in Edge Function secrets.**
   Never in frontend code, never in `.env` files that get bundled.

4. **Overlap prevention is a database constraint** (`bookings_no_overlap`),
   not application logic. Two people booking the same slot at the same moment
   — only one succeeds.

5. **A failed email never rolls back a booking.** The booking is committed
   first, then the email is attempted. If Brevo fails, the booking still
   stands and the cancellation link is shown on screen.

## Setup

### 1. Supabase

The Supabase project is already provisioned. The database migrations (schema,
RLS policies, functions) have been applied automatically.

### 2. Create the admin user

1. Go to the Supabase dashboard → **Authentication → Users**.
2. Click **Add user** and create an account with an email and password.
3. Copy the user's UUID.
4. Go to **SQL Editor** and run:
   ```sql
   INSERT INTO public.admins (user_id) VALUES ('the-user-uuid-here');
   ```
5. Go to `#/admin` in the app and sign in with those credentials.

### 3. Brevo (transactional email)

1. Create a free account at [brevo.com](https://www.brevo.com).
2. Go to **SMTP & API → API Keys** and create an API key.
3. Go to **Senders & IP** and verify your sender email address.
4. In the Supabase dashboard, go to **Edge Functions → Secrets** and add:
   - `BREVO_API_KEY` — your API key
   - `BREVO_SENDER_EMAIL` — your verified sender email
   - `BREVO_SENDER_NAME` — display name (e.g. "Court Bookings")

### 4. Cloudflare Turnstile (bot protection)

1. Go to [dash.cloudflare.com → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Create a new widget. Note the **site key** (public) and **secret key** (private).
3. In your `.env` file, set `VITE_TURNSTILE_SITE_KEY` to the site key.
4. In the Supabase dashboard, go to **Edge Functions → Secrets** and add:
   - `TURNSTILE_SECRET` — the secret key

### 5. SITE_URL

In the Supabase dashboard under **Edge Functions → Secrets**, set:
- `SITE_URL` — the public URL where your app is deployed (e.g. `https://your-site.com`)

This is used to build the cancellation links in emails.

### 6. Edge Functions

The three Edge Functions are deployed automatically:
- `create-booking` — creates a booking, sends confirmation email
- `cancel-booking` — cancels a booking by token, sends cancellation email
- `lookup-booking` — finds a booking by reference + contact

If you modify the Edge Function source under `supabase/functions/`, redeploy
by running the deploy tool again.

## Environment variables

See `.env.example` for a complete list. Variables prefixed with `VITE_` are
safe for the frontend bundle. All others are Edge Function secrets set in the
Supabase dashboard.

## Pages

- **`/`** — Landing page with the availability calendar. Week view, drag to
  select multi-hour blocks, realtime updates.
- **`/booked`** — Confirmation screen after booking. Shows reference code and
  cancellation link.
- **`/cancel?token=…`** — Cancel a booking using the cancellation link.
- **`/find`** — Find a booking by reference + email or phone.
- **`/admin`** — Admin dashboard behind Supabase email/password auth.

## Timezone

Everything is Africa/Kigali (UTC+2, no DST). All times are stored as
`timestamptz` and slot arithmetic happens in Postgres with `AT TIME ZONE`,
reading the timezone from the settings table.
