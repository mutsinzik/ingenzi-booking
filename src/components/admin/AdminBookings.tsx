import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, type Booking } from '@/lib/supabase';
import { adminCreateBooking } from '@/lib/api';
import { formatDateTimeFull, getTimezoneOffsetString } from '@/lib/time';
import { useConfig } from '@/hooks/useConfig';
import { Search, Loader2, Ban, Plus, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';

export function AdminBookings() {
  const { settings } = useConfig();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const tz = settings?.timezone ?? 'Africa/Kigali';

  // Debounce search input so we don't query the DB on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    let query = supabase.from('bookings')
      .select('id, reference, booker_name, booker_email, booker_phone, starts_at, ends_at, status, created_by_admin, cancelled_at')
      .order('starts_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    const offset = getTimezoneOffsetString(new Date(), tz);
    if (dateFrom) {
      query = query.gte('starts_at', `${dateFrom}T00:00:00${offset}`);
    }
    if (dateTo) {
      query = query.lte('starts_at', `${dateTo}T23:59:59${offset}`);
    }

    const { data, error } = await query.limit(200);
    if (error) {
      console.error('Failed to load bookings:', error);
    } else {
      let filtered = (data ?? []) as Booking[];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (b) =>
            b.booker_name.toLowerCase().includes(q) ||
            b.booker_email.toLowerCase().includes(q) ||
            b.booker_phone.includes(q) ||
            b.reference.toLowerCase().includes(q),
        );
      }
      setBookings(filtered);
    }
    setLoading(false);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch, tz]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      const { error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: id });
      if (error) throw error;
      await load();
    } catch (err) {
      console.error('Cancel failed:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleCreateSuccess = async () => {
    setShowCreateForm(false);
    await load();
  };

  const totalPages = Math.max(1, Math.ceil(bookings.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedBookings = bookings.slice(pageStart, pageEnd);

  return (
    <div>
      {/* Top bar with create button */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">All bookings</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation"
        >
          <Plus size={18} /> <span className="hidden sm:inline">Create booking</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, ref…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'confirmed' | 'cancelled')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No bookings found matching your filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Reference</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 hidden lg:table-cell">Contact</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">When</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{b.reference}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.booker_name}</div>
                      {b.created_by_admin && (
                        <span className="text-xs text-blue-600">by admin</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-gray-700">{b.booker_email}</div>
                      <div className="text-gray-500 text-xs">{b.booker_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="text-xs">{formatDateTimeFull(b.starts_at, b.ends_at, tz)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {b.status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          Cancelled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.status === 'confirmed' && new Date(b.starts_at) > new Date() && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          disabled={cancellingId === b.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-400"
                        >
                          {cancellingId === b.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Ban size={14} />
                          )}
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {pagedBookings.map((b) => (
              <div key={b.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-gray-900">{b.reference}</div>
                    <div className="font-medium text-gray-900 mt-0.5">
                      {b.booker_name}
                      {b.created_by_admin && <span className="text-xs text-blue-600 ml-1">(admin)</span>}
                    </div>
                  </div>
                  {b.status === 'confirmed' ? (
                    <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                      Confirmed
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-1">
                  {b.booker_email} · {b.booker_phone}
                </div>
                <div className="text-xs text-gray-700 mb-3">
                  {formatDateTimeFull(b.starts_at, b.ends_at, tz)}
                </div>
                {b.status === 'confirmed' && new Date(b.starts_at) > new Date() && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancellingId === b.id}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-400 touch-manipulation"
                  >
                    {cancellingId === b.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Ban size={14} />
                    )}
                    Cancel booking
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {bookings.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-1">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              {pageStart + 1}–{Math.min(pageEnd, bookings.length)} of {bookings.length}
            </span>
            <span className="text-gray-300">|</span>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-gray-700 px-2 min-w-[70px] text-center">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Create booking modal */}
      {showCreateForm && (
        <CreateBookingForm
          timezone={tz}
          courtName={settings?.court_name ?? 'Court 1'}
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}

function CreateBookingForm({
  timezone,
  courtName,
  onClose,
  onSuccess,
}: {
  timezone: string;
  courtName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !phone.trim() || !date || !startTime || !endTime) {
      setError('All fields are required');
      return;
    }

    const offset = getTimezoneOffsetString(new Date(), timezone);
    const startsAt = `${date}T${startTime}:00${offset}`;
    const endsAt = `${date}T${endTime}:00${offset}`;

    setSubmitting(true);
    try {
      await adminCreateBooking({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
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
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900">Create booking (walk-in)</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-gray-100 touch-manipulation"
            aria-label="Close"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">{courtName}</div>
            <div className="text-xs text-blue-700 mt-1">Admin bookings bypass advance notice and horizon limits.</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
              placeholder="+250 788 123 456"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
              />
            </div>
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
            className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 flex items-center justify-center gap-2 text-base touch-manipulation"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Create booking'}
          </button>
        </form>
      </div>
    </div>
  );
}
