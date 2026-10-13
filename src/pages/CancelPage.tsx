import { useState, useEffect } from 'react';
import { fetchBookingByToken, cancelBooking, type BookingByToken } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { navigate } from '@/hooks/useRouter';
import { formatDateTimeFull } from '@/lib/time';
import { AlertCircle, Loader2, Check, X, Calendar as CalIcon } from 'lucide-react';

type CancelPageProps = {
  token: string;
};

export function CancelPage({ token }: CancelPageProps) {
  const { settings } = useConfig();
  const [booking, setBooking] = useState<BookingByToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const tz = settings?.timezone ?? 'Africa/Kigali';
  const courtName = settings?.court_name ?? 'Court 1';

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('No cancellation token provided. Check your link and try again.');
      return;
    }
    fetchBookingByToken(token)
      .then((data) => {
        if (!data) {
          setError('This cancellation link is not valid. Check the link and try again.');
        } else {
          setBooking(data);
        }
      })
      .catch(() => setError('Could not load booking details. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelBooking(token);
      setCancelled(true);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancellation failed. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (!token || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <X size={28} className="text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-4">Can't cancel</h1>
          <p className="text-gray-600 mt-2">{error ?? 'Invalid cancellation link.'}</p>
          <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-blue-600 hover:underline">
            Back to calendar
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mt-4">Booking cancelled</h1>
          <p className="text-gray-600 mt-2">
            Your booking ({booking?.reference}) has been cancelled. The slot is now available for others.
          </p>
          <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-blue-600 hover:underline">
            Back to calendar
          </button>
        </div>
      </div>
    );
  }

  const alreadyCancelled = booking?.status === 'cancelled';
  const alreadyStarted = booking && new Date(booking.starts_at) <= new Date();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Cancel booking</h1>

          {alreadyCancelled ? (
            <div className="text-center py-4">
              <p className="text-gray-700">This booking has already been cancelled.</p>
              <p className="text-sm text-gray-500 mt-2">Reference: {booking?.reference}</p>
              <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-blue-600 hover:underline">
                Back to calendar
              </button>
            </div>
          ) : alreadyStarted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <CalIcon size={24} className="text-amber-600" />
              </div>
              <p className="text-gray-700 mt-3 font-medium">This booking has already started</p>
              <p className="text-sm text-gray-500 mt-1">Bookings can't be cancelled once they've begun.</p>
              <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-blue-600 hover:underline">
                Back to calendar
              </button>
            </div>
          ) : (
            <>
              {/* Booking details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Reference</div>
                <div className="text-lg font-bold text-gray-900 tracking-wider">{booking?.reference}</div>
                <div className="mt-2 text-xs font-medium text-gray-500 uppercase">When</div>
                <div className="text-sm font-semibold text-gray-900">
                  {booking ? formatDateTimeFull(booking.starts_at, booking.ends_at, tz) : ''}
                </div>
                <div className="text-sm text-gray-500">{courtName}</div>
                <div className="mt-2 text-xs font-medium text-gray-500 uppercase">Booked for</div>
                <div className="text-sm text-gray-700">{booking?.booker_name}</div>
              </div>

              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to cancel this booking? This can't be undone.
              </p>

              {/* Error */}
              {cancelError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{cancelError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate({ name: 'home' })}
                  className="flex-1 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
                >
                  Keep booking
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-3 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 active:bg-red-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                >
                  {cancelling ? <Loader2 size={16} className="animate-spin" /> : 'Yes, cancel'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
