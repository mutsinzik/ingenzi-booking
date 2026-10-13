import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, type Slot, type SlotBooker } from '@/lib/supabase';
import { fetchAvailability, fetchSlotBookers } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import {
  startOfWeek, addDays, addWeeks, toDateString, formatDateLabel,
  isToday, WEEKDAY_NAMES, getHourFromTimeStr,
} from '@/lib/time';
import { ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';

type DayData = {
  date: Date;
  slots: Slot[];
  isClosed: boolean;
  closureReason: string | null;
};

type CalendarProps = {
  onSelectSlot: (startsAt: string, endsAt: string) => void;
};

export function AvailabilityCalendar({ onSelectSlot }: CalendarProps) {
  const { settings, operatingHours, closures, loading, error } = useConfig();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
  const [bookers, setBookers] = useState<Map<string, SlotBooker>>(new Map());
  const dragStartRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  const tz = settings?.timezone ?? 'Africa/Kigali';
  const maxBookingMs = (settings?.max_hours_per_booking ?? 4) * 3600 * 1000;

  const loadSlots = useCallback(async (start: Date) => {
    setSlotsLoading(true);
    setSlotsError(null);
    try {
      const startDate = toDateString(start);
      const endDate = toDateString(addDays(start, 6));
      const [slotData, bookerMap] = await Promise.all([
        fetchAvailability(startDate, endDate),
        fetchSlotBookers(startDate, endDate),
      ]);
      setSlots(slotData);
      setBookers(bookerMap);
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Could not load availability');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (settings) {
      loadSlots(weekStart);
    }
  }, [weekStart, settings, loadSlots]);

  // Realtime subscription on slot_changes
  useEffect(() => {
    const channel = supabase
      .channel('slot_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_changes' }, () => {
        loadSlots(weekStart);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekStart, loadSlots]);

  // Build day columns
  const days: DayData[] = useMemo(() => {
    const result: DayData[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const dow = date.getDay();
      const hours = operatingHours.find((h) => h.day_of_week === dow);
      const daySlots = slots.filter((s) => {
        const slotDate = new Date(s.starts_at);
        return slotDate.getUTCFullYear() === date.getFullYear() &&
          slotDate.getUTCMonth() === date.getMonth() &&
          slotDate.getUTCDate() === date.getDate();
      });

      const dateStr = toDateString(date);
      const daySlotsByDate = slots.filter((s) => s.slot_date === dateStr);
      const allDaySlots = daySlots.length > 0 ? daySlots : daySlotsByDate;

      const dayClosures = closures.filter((c) => {
        const cStart = new Date(c.starts_at);
        const cEnd = new Date(c.ends_at);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        return cStart <= dayEnd && cEnd >= date;
      });

      const isClosed = !hours?.is_open || dayClosures.length > 0;
      const closureReason = dayClosures[0]?.reason ?? null;

      result.push({
        date,
        slots: allDaySlots,
        isClosed: !hours?.is_open ? true : isClosed,
        closureReason: hours?.is_open ? closureReason : 'Closed',
      });
    }
    return result;
  }, [weekStart, slots, operatingHours, closures]);

  // Collect all unique hour rows
  const hourRows = useMemo(() => {
    const hours = new Set<number>();
    days.forEach((d) => {
      d.slots.forEach((s) => {
        hours.add(getHourFromTimeStr(s.starts_at, tz));
      });
    });
    return Array.from(hours).sort((a, b) => a - b);
  }, [days, tz]);

  const handleCellClick = (slot: Slot, e: React.MouseEvent) => {
    if (!slot.is_available) return;
    if (e.shiftKey && selectedStart) {
      const startSlot = slots.find((s) => s.starts_at === selectedStart);
      if (startSlot && startSlot.slot_date === slot.slot_date) {
        const start = new Date(startSlot.starts_at).getTime();
        const end = new Date(slot.ends_at).getTime();
        if (end > start && end - start <= maxBookingMs) {
          const inBetween = slots.filter(
            (s) => s.slot_date === slot.slot_date &&
              new Date(s.starts_at).getTime() >= start &&
              new Date(s.ends_at).getTime() <= end
          );
          if (inBetween.every((s) => s.is_available)) {
            setSelectedStart(startSlot.starts_at);
            setSelectedEnd(slot.ends_at);
            return;
          }
        }
      }
    }
    setSelectedStart(slot.starts_at);
    setSelectedEnd(slot.ends_at);
    dragStartRef.current = slot.starts_at;
    isDraggingRef.current = true;
  };

  const handleCellEnter = (slot: Slot) => {
    if (!dragStartRef.current || !isDraggingRef.current) return;
    if (!slot.is_available) return;
    if (slot.slot_date !== slots.find((s) => s.starts_at === dragStartRef.current)?.slot_date) return;
    const start = new Date(dragStartRef.current).getTime();
    const end = new Date(slot.ends_at).getTime();
    if (end > start && end - start <= maxBookingMs) {
      const inBetween = slots.filter(
        (s) => s.slot_date === slot.slot_date &&
          new Date(s.starts_at).getTime() >= start &&
          new Date(s.ends_at).getTime() <= end
      );
      if (inBetween.every((s) => s.is_available)) {
        setSelectedStart(dragStartRef.current);
        setSelectedEnd(slot.ends_at);
      }
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current && dragStartRef.current && selectedStart && selectedEnd) {
      onSelectSlot(selectedStart, selectedEnd);
      setSelectedStart(null);
      setSelectedEnd(null);
    }
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  });

  const handleBookSelected = () => {
    if (selectedStart && selectedEnd) {
      onSelectSlot(selectedStart, selectedEnd);
    }
  };

  const isSlotSelected = (slot: Slot): boolean => {
    if (!selectedStart || !selectedEnd) return false;
    const slotStart = new Date(slot.starts_at).getTime();
    const selStart = new Date(selectedStart).getTime();
    const selEnd = new Date(selectedEnd).getTime();
    return slotStart >= selStart && slotStart < selEnd;
  };

  if (loading) {
    return <CalendarSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-800 font-medium">Could not load the calendar</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-gray-200 bg-gray-50 gap-2">
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
            aria-label="Previous week"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
            aria-label="Next week"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="text-xs sm:text-sm font-semibold text-gray-700 text-center flex-1 min-w-0">
          <span className="hidden sm:inline">{formatDateLabel(weekStart)} – {formatDateLabel(addDays(weekStart, 6))}</span>
          <span className="sm:hidden">{formatDateLabel(weekStart)}</span>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
          <Calendar size={16} className="text-gray-400 hidden sm:block" />
          <input
            type="date"
            aria-label="Jump to date"
            value={toDateString(weekStart)}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(d.getTime())) {
                setWeekStart(startOfWeek(d));
              }
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[140px]"
          />
        </div>
      </div>

      {/* Selection bar */}
      {selectedStart && selectedEnd && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-200 gap-2">
          <span className="text-sm text-blue-800 font-medium">
            Selected: {formatSlotRange(selectedStart, selectedEnd, tz)}
            {(() => {
              const dur = (new Date(selectedEnd).getTime() - new Date(selectedStart).getTime()) / 3600000;
              return <span className="text-blue-500 ml-1">({dur}h · max {settings?.max_hours_per_booking ?? 4}h)</span>;
            })()}
          </span>
          <button
            onClick={handleBookSelected}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation"
          >
            Book this slot
          </button>
        </div>
      )}

      {/* Calendar grid — desktop */}
      <div className="hidden md:block overflow-x-auto">
        {slotsLoading && slots.length === 0 ? (
          <CalendarGridSkeleton />
        ) : slotsError ? (
          <div className="p-8 text-center text-red-600">{slotsError}</div>
        ) : (
          <div className="grid grid-cols-7 border-b border-gray-200">
            {days.map((day, i) => (
              <div key={i} className={`text-center py-2 border-r border-gray-200 last:border-r-0 ${isToday(day.date) ? 'bg-blue-50' : ''}`}>
                <div className="text-xs font-medium text-gray-500 uppercase">{WEEKDAY_NAMES[day.date.getDay()]}</div>
                <div className={`text-lg font-bold ${isToday(day.date) ? 'text-blue-600' : 'text-gray-800'}`}>
                  {day.date.getDate()}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-7 relative">
          {days.map((day, dayIdx) => (
            <div key={dayIdx} className="border-r border-gray-200 last:border-r-0 min-h-[200px]">
              {day.isClosed ? (
                <div className="flex items-center justify-center h-full min-h-[200px] px-2">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Closed</div>
                    {day.closureReason && (
                      <div className="text-xs text-gray-400 mt-1">{day.closureReason}</div>
                    )}
                  </div>
                </div>
              ) : day.slots.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <span className="text-xs text-gray-300">No slots</span>
                </div>
              ) : (
                day.slots.map((slot) => {
                  const selected = isSlotSelected(slot);
                  const isPast = new Date(slot.ends_at).getTime() <= Date.now();
                  const isBooked = !slot.is_available && !isPast;
                  return (
                    <button
                      key={slot.starts_at}
                      onClick={(e) => handleCellClick(slot, e)}
                      onMouseEnter={() => handleCellEnter(slot)}
                      disabled={!slot.is_available}
                      className={`w-full text-left px-2 py-1.5 border-b border-gray-100 text-xs transition-colors select-none h-14 overflow-hidden flex flex-col justify-center ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : slot.is_available
                            ? 'bg-green-50 hover:bg-green-100 text-green-900 cursor-pointer'
                            : isPast
                              ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <div className="font-medium leading-tight">
                        {formatSlotRange(slot.starts_at, slot.ends_at, tz)}
                      </div>
                      <div className={`leading-tight ${selected ? 'text-blue-100' : slot.is_available ? 'text-green-600' : isPast ? 'text-gray-300' : 'text-gray-400'}`}>
                        {selected ? 'Selected' : slot.is_available ? 'Free' : isPast ? 'Past' : 'Booked'}
                      </div>
                      {isBooked && !selected && bookers.has(slot.starts_at) && (
                        <div className="flex items-center gap-1 text-[10px] leading-tight truncate">
                          <User size={9} className="flex-shrink-0" />
                          <span className="truncate text-gray-500">{bookers.get(slot.starts_at)?.booker_name}</span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar — mobile (single day list) */}
      <div className="md:hidden">
        <MobileDayList
          days={days}
          tz={tz}
          slotsLoading={slotsLoading}
          slotsError={slotsError}
          onSelectSlot={onSelectSlot}
          bookers={bookers}
          maxBookingMs={maxBookingMs}
          maxHours={settings?.max_hours_per_booking ?? 4}
        />
      </div>
    </div>
  );
}

function MobileDayList({
  days, tz, slotsLoading, slotsError, onSelectSlot, bookers, maxBookingMs, maxHours,
}: {
  days: DayData[];
  tz: string;
  slotsLoading: boolean;
  slotsError: string | null;
  onSelectSlot: (startsAt: string, endsAt: string) => void;
  bookers: Map<string, SlotBooker>;
  maxBookingMs: number;
  maxHours: number;
}) {
  const todayIdx = days.findIndex((d) => isToday(d.date));
  const [selectedDay, setSelectedDay] = useState(() => Math.max(0, todayIdx));
  const [mobileStart, setMobileStart] = useState<string | null>(null);
  const [mobileEnd, setMobileEnd] = useState<string | null>(null);

  // Jump to today when the week changes and today is in this week
  useEffect(() => {
    if (todayIdx >= 0) {
      setSelectedDay(todayIdx);
    }
  }, [todayIdx]);

  const day = days[selectedDay];

  const isSlotInRange = (slot: Slot): boolean => {
    if (!mobileStart || !mobileEnd) return false;
    const slotStart = new Date(slot.starts_at).getTime();
    const selStart = new Date(mobileStart).getTime();
    const selEnd = new Date(mobileEnd).getTime();
    return slotStart >= selStart && slotStart < selEnd;
  };

  const handleSlotTap = (slot: Slot) => {
    if (!slot.is_available) return;

    // No start selected yet — set this as the start
    if (!mobileStart) {
      setMobileStart(slot.starts_at);
      setMobileEnd(slot.ends_at);
      return;
    }

    // Tapping the same start slot deselects
    if (mobileStart === slot.starts_at && mobileEnd === slot.ends_at) {
      setMobileStart(null);
      setMobileEnd(null);
      return;
    }

    // A start is already selected — try to extend to this slot
    const startSlot = day.slots.find((s) => s.starts_at === mobileStart);
    if (!startSlot) return;

    const startMs = new Date(startSlot.starts_at).getTime();
    const endMs = new Date(slot.ends_at).getTime();

    // If tapping a slot before the current start, make it the new start
    if (endMs <= startMs) {
      setMobileStart(slot.starts_at);
      setMobileEnd(slot.ends_at);
      return;
    }

    // Check max booking duration
    if (endMs - startMs > maxBookingMs) return;

    // Check all slots in between are available
    const inBetween = day.slots.filter(
      (s) =>
        new Date(s.starts_at).getTime() >= startMs &&
        new Date(s.ends_at).getTime() <= endMs
    );

    if (inBetween.every((s) => s.is_available)) {
      setMobileStart(startSlot.starts_at);
      setMobileEnd(slot.ends_at);
    }
  };

  const handleBook = () => {
    if (mobileStart && mobileEnd) {
      onSelectSlot(mobileStart, mobileEnd);
      setMobileStart(null);
      setMobileEnd(null);
    }
  };

  const selectionDuration = mobileStart && mobileEnd
    ? (new Date(mobileEnd).getTime() - new Date(mobileStart).getTime()) / 3600000
    : 0;

  return (
    <div>
      {/* Day selector */}
      <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 scrollbar-hide">
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedDay(i);
              setMobileStart(null);
              setMobileEnd(null);
            }}
            className={`flex-shrink-0 px-3 py-2.5 text-center min-w-[58px] transition-colors touch-manipulation ${
              i === selectedDay ? 'border-b-2 border-blue-600 bg-white' : ''
            }`}
          >
            <div className="text-xs text-gray-500">{WEEKDAY_NAMES[d.date.getDay()]}</div>
            <div className={`text-base font-bold ${i === selectedDay ? 'text-blue-600' : 'text-gray-700'}`}>
              {d.date.getDate()}
            </div>
          </button>
        ))}
      </div>

      {/* Mobile selection bar */}
      {mobileStart && mobileEnd && (
        <div className="flex flex-col gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-200">
          <span className="text-sm text-blue-800 font-medium">
            {formatSlotRange(mobileStart, mobileEnd, tz)}
            <span className="text-blue-500 ml-1">({selectionDuration}h · max {maxHours}h)</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setMobileStart(null); setMobileEnd(null); }}
              className="flex-1 px-3 py-2 bg-white text-gray-600 text-sm font-medium rounded-lg border border-gray-300 active:bg-gray-100 transition-colors touch-manipulation"
            >
              Clear
            </button>
            <button
              onClick={handleBook}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg active:bg-blue-800 transition-colors touch-manipulation"
            >
              Book this slot
            </button>
          </div>
        </div>
      )}

      {/* Mobile instructions */}
      {!mobileStart && !slotsLoading && !slotsError && !day.isClosed && day.slots.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 text-center">
          Tap a free slot to start, then tap another to extend your booking
        </div>
      )}

      {slotsLoading ? (
        <div className="p-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg mb-2 animate-pulse" />
          ))}
        </div>
      ) : slotsError ? (
        <div className="p-6 text-center text-red-600 text-sm">{slotsError}</div>
      ) : day.isClosed ? (
        <div className="p-8 text-center">
          <div className="text-sm font-semibold text-gray-400 uppercase">Closed</div>
          {day.closureReason && <div className="text-sm text-gray-500 mt-2">{day.closureReason}</div>}
        </div>
      ) : day.slots.length === 0 ? (
        <div className="p-8 text-center text-gray-400">No slots available</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {day.slots.map((slot) => {
            const inRange = isSlotInRange(slot);
            const isStart = mobileStart === slot.starts_at;
            const isPast = new Date(slot.ends_at).getTime() <= Date.now();
            const isBooked = !slot.is_available && !isPast;
            return (
              <button
                key={slot.starts_at}
                onClick={() => slot.is_available && handleSlotTap(slot)}
                disabled={!slot.is_available}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                  inRange
                    ? 'bg-blue-600 text-white'
                    : slot.is_available
                      ? 'bg-green-50 active:bg-green-200'
                      : isPast
                        ? 'bg-gray-50 cursor-not-allowed'
                        : 'bg-gray-50 cursor-not-allowed'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className={`font-medium ${inRange ? 'text-white' : slot.is_available ? 'text-gray-800' : isPast ? 'text-gray-300' : 'text-gray-400'}`}>
                    {formatSlotRange(slot.starts_at, slot.ends_at, tz)}
                  </span>
                  {isBooked && !inRange && bookers.has(slot.starts_at) && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                      <User size={11} className="flex-shrink-0" />
                      <span className="truncate">{bookers.get(slot.starts_at)?.booker_name}</span>
                    </div>
                  )}
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ml-2 ${
                  inRange
                    ? 'text-blue-100'
                    : slot.is_available
                      ? isStart
                        ? 'text-blue-700 bg-blue-100 px-2 py-1 rounded'
                        : 'text-green-700 bg-green-100 px-2 py-1 rounded'
                      : isPast
                        ? 'text-gray-300'
                        : 'text-gray-400'
                }`}>
                  {inRange ? 'Selected' : slot.is_available ? (isStart ? 'Start' : 'Free') : isPast ? 'Past' : 'Booked'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatSlotTime(startsAt: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startsAt));
}

function formatSlotRange(startsAt: string, endsAt: string, tz: string): string {
  const start = formatSlotTime(startsAt, tz);
  const end = formatSlotTime(endsAt, tz);
  return `${start} – ${end}`;
}

function CalendarSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="h-12 bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-7">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="border-r border-gray-200 last:border-r-0">
            {[...Array(8)].map((_, j) => (
              <div key={j} className="h-12 border-b border-gray-100 bg-gray-50 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarGridSkeleton() {
  return (
    <div className="p-8">
      <div className="grid grid-cols-7 gap-1">
        {[...Array(56)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
