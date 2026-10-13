import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, TrendingUp } from 'lucide-react';
import { supabase, type Booking, type Closure, type OperatingHours, type Settings } from '@/lib/supabase';

type Stats = {
  bookingsThisWeek: number;
  cancellationsThisWeek: number;
  utilisation: number;
};

type Week = {
  start: string;
  end: string;
};

function getLocalDateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function getLocalDateString(date: Date, timezone: string): string {
  const { year, month, day } = getLocalDateParts(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getWeekForTimezone(now: Date, timezone: string): Week {
  const local = getLocalDateParts(now, timezone);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);

  const start = localDate.toISOString().slice(0, 10);
  localDate.setUTCDate(localDate.getUTCDate() + 7);
  return { start, end: localDate.toISOString().slice(0, 10) };
}

function getDateForWeekOffset(weekStart: string, offset: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function localDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - getTimeZoneOffsetMs(guess, timezone));
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function getClosureMinutes(
  closure: Closure,
  dayStart: Date,
  dayEnd: Date,
): number {
  const overlapStart = new Date(Math.max(new Date(closure.starts_at).getTime(), dayStart.getTime()));
  const overlapEnd = new Date(Math.min(new Date(closure.ends_at).getTime(), dayEnd.getTime()));
  return minutesBetween(overlapStart, overlapEnd);
}

function calculateAvailableMinutes(
  week: Week,
  timezone: string,
  hours: OperatingHours[],
  closures: Closure[],
): number {
  let availableMinutes = 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = getDateForWeekOffset(week.start, dayOffset);
    const dayOfWeek = (dayOffset + 1) % 7;
    const dayHours = hours.find((item) => item.day_of_week === dayOfWeek);
    if (!dayHours?.is_open) continue;

    const dayStart = localDateTimeToUtc(date, dayHours.open_time, timezone);
    const dayEnd = localDateTimeToUtc(date, dayHours.close_time, timezone);
    const closedMinutes = closures.reduce(
      (total, closure) => total + getClosureMinutes(closure, dayStart, dayEnd),
      0,
    );
    availableMinutes += Math.max(0, minutesBetween(dayStart, dayEnd) - closedMinutes);
  }

  return availableMinutes;
}

export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const settingsResult = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      const settings = settingsResult.data as Settings | null;
      if (settingsResult.error || !settings) {
        if (active) setError(true);
        return;
      }

      const week = getWeekForTimezone(new Date(), settings.timezone);
      const weekStartIso = `${week.start}T00:00:00Z`;
      const weekEndIso = `${week.end}T00:00:00Z`;
      const [bookingsResult, hoursResult, closuresResult] = await Promise.all([
        supabase.from('bookings')
          .select('starts_at, ends_at, status, cancelled_at')
          .or(`starts_at.gte.${weekStartIso},starts_at.lt.${weekEndIso},cancelled_at.gte.${weekStartIso},cancelled_at.lt.${weekEndIso}`),
        supabase.from('operating_hours').select('day_of_week, is_open, open_time, close_time'),
        supabase.from('closures').select('starts_at, ends_at').gte('ends_at', weekStartIso).lt('starts_at', weekEndIso),
      ]);

      if (bookingsResult.error || hoursResult.error || closuresResult.error) {
        if (active) setError(true);
        return;
      }

      const bookings = (bookingsResult.data ?? []) as Pick<Booking, 'starts_at' | 'ends_at' | 'status' | 'cancelled_at'>[];
      const hours = (hoursResult.data ?? []) as OperatingHours[];
      const closures = (closuresResult.data ?? []) as Closure[];
      const inCurrentWeek = (date: string | null): boolean => {
        if (!date) return false;
        const localDate = getLocalDateString(new Date(date), settings.timezone);
        return localDate >= week.start && localDate < week.end;
      };
      const confirmed = bookings.filter((booking) => booking.status === 'confirmed' && inCurrentWeek(booking.starts_at));
      const cancelled = bookings.filter((booking) => booking.status === 'cancelled' && inCurrentWeek(booking.cancelled_at));
      const bookedMinutes = confirmed.reduce(
        (total, booking) => total + minutesBetween(new Date(booking.starts_at), new Date(booking.ends_at)),
        0,
      );
      const availableMinutes = calculateAvailableMinutes(week, settings.timezone, hours, closures);

      if (active) {
        setStats({
          bookingsThisWeek: confirmed.length,
          cancellationsThisWeek: cancelled.length,
          utilisation: availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0,
        });
        setError(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load this week’s dashboard figures.</div>;
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 h-16 sm:h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <CalendarCheck size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Bookings this week</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.bookingsThisWeek}</div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <CalendarX size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Cancellations this week</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.cancellationsThisWeek}</div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <TrendingUp size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Utilisation this week</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.utilisation}%</div>
      </div>
    </div>
  );
}
