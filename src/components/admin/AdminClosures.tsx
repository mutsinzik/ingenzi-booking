import { useState, useEffect, useCallback } from 'react';
import { supabase, type Closure } from '@/lib/supabase';
import { useConfig } from '@/hooks/useConfig';
import { formatDateTimeFull } from '@/lib/time';
import { Loader2, Trash2, Plus } from 'lucide-react';

export function AdminClosures() {
  const { closures, reload } = useConfig();
  const [adding, setAdding] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    if (!startDate || !endDate) {
      setError('Please set start and end dates');
      return;
    }
    const startsAt = `${startDate}T${startTime}:00+02:00`;
    const endsAt = `${endDate}T${endTime}:00+02:00`;
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('End must be after start');
      return;
    }
    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .from('closures')
        .insert({ starts_at: startsAt, ends_at: endsAt, reason: reason.trim() || null });
      if (insertError) throw insertError;
      setAdding(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add closure');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('closures').delete().eq('id', id);
    await reload();
  };

  const formatClosureDate = (startsAt: string, endsAt: string): string => {
    const tz = 'Africa/Kigali';
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(start) + ' – ' + new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(end);
    }
    return formatDateTimeFull(startsAt, endsAt, tz);
  };

  return (
    <div>
      {/* Existing closures */}
      {closures.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg border border-gray-200 mb-4">
          <p className="text-gray-500">No closures scheduled. The court is open every operating day.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 mb-4">
          {closures.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {formatClosureDate(c.starts_at, c.ends_at)}
                </div>
                {c.reason && <div className="text-xs text-gray-500 mt-0.5">{c.reason}</div>}
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add closure form */}
      {adding ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Add a closure</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Maintenance, holiday, tournament…"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Add closure'}
            </button>
            <button
              onClick={() => { setAdding(false); setError(null); }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            setStartDate(today);
            setEndDate(today);
            setAdding(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} /> Add closure
        </button>
      )}
    </div>
  );
}
