import { useState, useEffect, useCallback } from 'react';
import { supabase, type Booking, type Settings, type Slot } from '@/lib/supabase';
import { fetchAvailability } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import {
  startOfWeek, addDays, addWeeks, toDateString, formatDateLabel,
  isToday, WEEKDAY_NAMES,
} from '@/lib/time';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type AdminDayViewProps = {
  settings: Settings | null;
};

export function AdminDayView({ settings }: AdminDayViewProps) {
  const { operatingHours, closures } = useConfig();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const tz = settings?.timezone ?? 'Africa/Kigali';

  const load = useCallback(async () => {
    setLoading(true);
    const startDate = toDateString(weekStart);
    const endDate = toDateString(addDays(weekStart, 6));
    const weekEndIso = `${endDate}T23:59:59Z`;

    const [slotsData, bookingsData] = await Promise.all([
      fetchAvailability(startDate, endDate),
      supabase
        .from('bookings')
        .select('*')
        .gte('starts_at', `${startDate}T00:00:00Z`)
        .lte('starts_at', weekEndIso)
        .order('starts_at'),
    ]);

    setSlots(slotsData);
    if (!bookingsData.error && bookingsData.data) {
      setBookings(bookingsData.data as Booking[]);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getBookingsForDay = (date: Date): Booking[] => {
    const dateStr = toDateString(date);
    return bookings.filter((b) => {
      const bDate = new Date(b.starts_at);
      const bDateStr = toDateString(bDate);
      return bDateStr === dateStr;
    });
  };

  const getSlotsForDay = (date: Date): Slot[] => {
    const dateStr = toDateString(date);
    return slots.filter((s) => s.slot_date === dateStr);
  };

  const getBookingForSlot = (slot: Slot): Booking | undefined => {
    return bookings.find(
      (b) =>
        b.status === 'confirmed' &&
        new Date(b.starts_at).getTime() === new Date(slot.starts_at).getTime(),
    );
  };

  const formatSlotTime = (startsAt: string): string => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(startsAt));
  };

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 touch-manipulation"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-200 active:bg-gray-300 touch-manipulation"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 touch-manipulation"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <span className="text-xs sm:text-sm font-semibold text-gray-700 text-right min-w-0">
          <span className="hidden sm:inline">{formatDateLabel(weekStart)} – {formatDateLabel(addDays(weekStart, 6))}</span>
          <span className="sm:hidden">{formatDateLabel(weekStart)}</span>
        </span>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">
          <ChevronRight size={24} className="animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {days.map((date, dayIdx) => {
            const dow = date.getDay();
            const hours = operatingHours.find((h) => h.day_of_week === dow);
            const daySlots = getSlotsForDay(date);
            const dayBookings = getBookingsForDay(date);
            const dayClosures = closures.filter((c) => {
              const cStart = new Date(c.starts_at);
              const cEnd = new Date(c.ends_at);
              const dayEnd = new Date(date);
              dayEnd.setHours(23, 59, 59, 999);
              return cStart <= dayEnd && cEnd >= date;
            });
            const isClosed = !hours?.is_open || dayClosures.length > 0;

            return (
              <div
                key={dayIdx}
                className={`bg-white rounded-lg border ${isToday(date) ? 'border-blue-300' : 'border-gray-200'} overflow-hidden`}
              >
                <div className={`px-3 py-2 border-b border-gray-200 ${isToday(date) ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <div className="text-xs font-medium text-gray-500">{WEEKDAY_NAMES[date.getDay()]}</div>
                  <div className={`text-lg font-bold ${isToday(date) ? 'text-blue-600' : 'text-gray-800'}`}>
                    {date.getDate()}
                  </div>
                </div>
                {isClosed ? (
                  <div className="p-4 text-center">
                    <span className="text-xs text-gray-400 uppercase">Closed</span>
                    {dayClosures[0]?.reason && (
                      <p className="text-xs text-gray-400 mt-1">{dayClosures[0].reason}</p>
                    )}
                  </div>
                ) : daySlots.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">No slots</div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
                    {daySlots.map((slot) => {
                      const booking = getBookingForSlot(slot);
                      return (
                        <div
                          key={slot.starts_at}
                          className={`px-3 py-2 text-xs ${
                            booking ? 'bg-blue-50' : slot.is_available ? 'bg-green-50' : 'bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-700">{formatSlotTime(slot.starts_at)}</div>
                          {booking ? (
                            <div className="mt-0.5">
                              <div className="font-medium text-blue-900 truncate">{booking.booker_name}</div>
                              <div className="text-blue-600 text-[10px]">{booking.reference}</div>
                            </div>
                          ) : slot.is_available ? (
                            <div className="text-green-600">Free</div>
                          ) : (
                            <div className="text-gray-400">Booked</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {dayBookings.filter((b) => b.status === 'cancelled').length > 0 && (
                  <div className="px-3 py-1 border-t border-gray-100 bg-gray-50">
                    <p className="text-[10px] text-gray-400">
                      {dayBookings.filter((b) => b.status === 'cancelled').length} cancelled
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
