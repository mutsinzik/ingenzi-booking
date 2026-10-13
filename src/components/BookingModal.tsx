import { useState } from 'react';
import { createBooking } from '@/lib/api';
import { formatDateTimeFull } from '@/lib/time';
import { X, Loader2, AlertCircle, Check } from 'lucide-react';

type BookingModalProps = {
  startsAt: string;
  endsAt: string;
  timezone: string;
  courtName: string;
  onClose: () => void;
  onSuccess: (result: {
    reference: string;
    cancel_token: string;
    starts_at: string;
    ends_at: string;
    booker_name: string;
    email_sent: boolean;
    email_error: string | null;
  }) => void;
};

export function BookingModal({
  startsAt, endsAt, timezone, courtName, onClose, onSuccess,
}: BookingModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; phone?: string }>({});

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (name.trim().length < 2) errors.name = 'Please enter your name (at least 2 characters)';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Please enter a valid email address';
    if (phone.replace(/\D/g, '').length < 9) errors.phone = 'Please enter a valid phone number';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await createBooking({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
      });
      onSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Booking failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900">Book a slot</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-gray-100 transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Booking summary */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">{courtName}</div>
            <div className="text-sm text-blue-900 font-semibold mt-1">
              {formatDateTimeFull(startsAt, endsAt, timezone)}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 disabled:bg-gray-50 text-base"
              placeholder="Jane Doe"
              autoComplete="name"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 disabled:bg-gray-50 text-base"
              placeholder="jane@example.com"
              autoComplete="email"
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 disabled:bg-gray-50 text-base"
              placeholder="+250 788 123 456"
              autoComplete="tel"
            />
            {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base touch-manipulation"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Booking…
              </>
            ) : (
              <>
                <Check size={18} /> Confirm booking
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center pb-2">
            You'll get a confirmation email and a cancellation link. No account needed.
          </p>
        </form>
      </div>
    </div>
  );
}
