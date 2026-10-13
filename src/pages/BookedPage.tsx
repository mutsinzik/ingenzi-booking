import { useState } from 'react';
import { navigate } from '@/hooks/useRouter';
import { useConfig } from '@/hooks/useConfig';
import { formatDateTimeFull } from '@/lib/time';
import { Check, Copy, Calendar as CalIcon, Home, Search } from 'lucide-react';

type BookedPageProps = {
  reference: string;
  cancelToken: string;
  startsAt: string;
  endsAt: string;
  bookerName: string;
  emailSent: boolean;
  emailError: string | null;
};

export function BookedPage(props: BookedPageProps) {
  const { settings } = useConfig();
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const tz = settings?.timezone ?? 'Africa/Kigali';
  const courtName = settings?.court_name ?? 'Court 1';
  const siteUrl = window.location.origin;
  const cancelUrl = `${siteUrl}/#/cancel?token=${props.cancelToken}`;

  const copyRef = async () => {
    await navigator.clipboard.writeText(props.reference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(cancelUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const downloadIcs = () => {
    const dtStart = new Date(props.startsAt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtEnd = new Date(props.endsAt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Court Booking//EN',
      'BEGIN:VEVENT',
      `UID:${props.cancelToken}@court-booking`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${courtName} booking`,
      `DESCRIPTION:Reference: ${props.reference}\\nCancel: ${cancelUrl}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.reference}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!props.reference) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <p className="text-gray-600">No booking information found.</p>
          <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-blue-600 hover:underline">
            Back to calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Success icon */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Booking confirmed</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">Thanks {props.bookerName || 'for booking'} — your slot is reserved.</p>
        </div>

        {/* Details card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
          {/* When */}
          <div className="mb-5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">When</div>
            <div className="text-base font-semibold text-gray-900 mt-1">
              {formatDateTimeFull(props.startsAt, props.endsAt, tz)}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">{courtName}</div>
          </div>

          {/* Reference */}
          <div className="mb-5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reference code</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-lg sm:text-2xl font-bold tracking-widest text-gray-900 text-center sm:text-left break-all">
                {props.reference}
              </div>
              <button
                onClick={copyRef}
                className="p-3 border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation flex-shrink-0"
                aria-label="Copy reference"
              >
                {copiedRef ? <Check size={20} className="text-green-600" /> : <Copy size={20} className="text-gray-500" />}
              </button>
            </div>
          </div>

          {/* Cancellation link */}
          <div className="mb-5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cancellation link</div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
              <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-amber-900 break-all">
                {cancelUrl}
              </div>
              <button
                onClick={copyLink}
                className="flex-shrink-0 px-3 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation flex items-center justify-center gap-1.5 text-sm font-medium text-gray-700 sm:p-2.5"
                aria-label="Copy link"
              >
                {copiedLink ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-500" />}
                <span className="sm:hidden">Copy link</span>
              </button>
            </div>
            <p className="text-sm font-medium text-gray-700 mt-2">
              Save this link — you'll need it to cancel. We've also emailed it to you.
            </p>
          </div>

          {/* Email warning */}
          {!props.emailSent && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm text-red-800 font-medium">
                We couldn't send your confirmation email, so please save the link above.
              </p>
              {props.emailError && (
                <p className="text-xs text-red-600 mt-1 break-all">
                  Reason: {props.emailError}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={downloadIcs}
              className="flex items-center justify-center gap-2 w-full py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
            >
              <CalIcon size={18} /> Add to calendar
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => navigate({ name: 'home' })}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              >
                <Home size={18} /> Calendar
              </button>
              <button
                onClick={() => navigate({ name: 'find' })}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              >
                <Search size={18} /> Find booking
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
