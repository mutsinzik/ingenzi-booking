import { useState } from 'react';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { BookingModal } from '@/components/BookingModal';
import { useConfig } from '@/hooks/useConfig';
import { navigate } from '@/hooks/useRouter';
import { CalendarDays, Search, Lock } from 'lucide-react';

type PendingBooking = {
  startsAt: string;
  endsAt: string;
};

export function HomePage() {
  const { settings } = useConfig();
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);

  const handleSelectSlot = (startsAt: string, endsAt: string) => {
    setPendingBooking({ startsAt, endsAt });
  };

  const handleBookingSuccess = (result: {
    reference: string;
    cancel_token: string;
    starts_at: string;
    ends_at: string;
    booker_name: string;
    email_sent: boolean;
    email_error: string | null;
  }) => {
    setPendingBooking(null);
    navigate({
      name: 'booked',
      reference: result.reference,
      cancelToken: result.cancel_token,
      startsAt: result.starts_at,
      endsAt: result.ends_at,
      bookerName: result.booker_name,
      emailSent: result.email_sent,
      emailError: result.email_error,
    });
  };

  const courtName = settings?.court_name ?? 'Court 1';
  const tz = settings?.timezone ?? 'Africa/Kigali';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <CalendarDays size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 leading-tight truncate">{courtName}</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Booking system</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => navigate({ name: 'find' })}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 transition-colors"
              aria-label="Find my booking"
            >
              <Search size={18} />
              <span>Find my booking</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Book a court slot</h2>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Check availability and reserve your time in seconds. No account needed.
          </p>
        </div>

        {/* Calendar */}
        <AvailabilityCalendar onSelectSlot={handleSelectSlot} />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-green-100 border border-green-200" /> Free
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-gray-100 border border-gray-200" /> Booked
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-blue-600" /> Selected
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Closed</span> — court unavailable
          </div>
        </div>

        {/* Find booking callout */}
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Search size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Already have a booking?</h3>
              <p className="text-sm text-gray-500 mt-0.5">Look up your booking to view details or cancel it.</p>
            </div>
          </div>
          <button
            onClick={() => navigate({ name: 'find' })}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium rounded-xl px-5 py-2.5 hover:bg-blue-700 transition-colors"
          >
            <Search size={18} /> Find my booking
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">{courtName} booking system</p>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={() => navigate({ name: 'find' })} className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium">
              <Search size={16} /> Find my booking
            </button>
            <button onClick={() => navigate({ name: 'admin' })} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 font-medium transition-colors">
              <Lock size={16} /> Admin
            </button>
          </div>
        </div>
      </footer>

      {/* Booking modal */}
      {pendingBooking && (
        <BookingModal
          startsAt={pendingBooking.startsAt}
          endsAt={pendingBooking.endsAt}
          timezone={tz}
          courtName={courtName}
          onClose={() => setPendingBooking(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
