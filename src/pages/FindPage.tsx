import { useState } from 'react';
import { lookupBooking, type LookupResult } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { navigate } from '@/hooks/useRouter';
import { formatDateTimeFull } from '@/lib/time';
import { AlertCircle, Loader2, Search, ArrowLeft, Check, Calendar as CalIcon } from 'lucide-react';

export function FindPage() {
  const { settings } = useConfig();
  const [reference, setReference] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const tz = settings?.timezone ?? 'Africa/Kigali';
  const courtName = settings?.court_name ?? 'Court 1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!contact.trim()) {
      setError('Please enter the email or phone you used to book.');
      return;
    }

    setSubmitting(true);
    try {
      const ref = reference.trim() || null;
      const data = await lookupBooking(ref, contact.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No bookings found with those details');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate({ name: 'home' })} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Find my booking</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-600 mb-4">
            Enter the email or phone you used to book. If you have your reference code, add it to go straight to your booking — otherwise we'll show all your upcoming bookings.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email or phone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                disabled={submitting}
                placeholder="jane@example.com or +250 788 123 456"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Reference code <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={submitting}
                placeholder="CRT-XXXXXX"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase tracking-wider font-mono text-base"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:bg-gray-300 flex items-center justify-center gap-2 touch-manipulation"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Search size={18} /> Find booking</>}
            </button>
          </form>
        </div>

        {/* Results */}
        {result && result.bookings.length > 0 && (
          <div className="mt-4 space-y-3">
            {result.bookings.length > 1 && (
              <div className="flex items-center gap-2 px-1">
                <Check size={16} className="text-green-600" />
                <span className="text-sm text-gray-600">
                  Found {result.bookings.length} bookings
                </span>
              </div>
            )}

            {result.bookings.map((booking) => (
              <div key={booking.cancel_token} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                {result.bookings.length === 1 && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Check size={18} className="text-green-600" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Booking found</h2>
                  </div>
                )}

                <div className="space-y-3 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Reference</div>
                    <div className="text-lg font-bold tracking-wider text-gray-900 break-all">{booking.reference}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">When</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatDateTimeFull(booking.starts_at, booking.ends_at, tz)}
                    </div>
                    <div className="text-sm text-gray-500">{courtName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Status</div>
                    <div className={`text-sm font-semibold ${booking.status === 'confirmed' ? 'text-green-700' : 'text-gray-500'}`}>
                      {booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                    </div>
                  </div>
                </div>

                {booking.status === 'confirmed' && (
                  <button
                    onClick={() => navigate({ name: 'cancel', token: booking.cancel_token })}
                    className="w-full py-3.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 active:bg-red-800 transition-colors touch-manipulation"
                  >
                    Cancel this booking
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
