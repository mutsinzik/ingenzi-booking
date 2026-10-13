import { useState, useEffect } from 'react';
import { supabase, type OperatingHours, type Booking } from '@/lib/supabase';
import { useConfig } from '@/hooks/useConfig';
import { WEEKDAY_NAMES_FULL } from '@/lib/time';
import { Loader2, AlertTriangle, Save } from 'lucide-react';

export function AdminHours() {
  const { operatingHours, reload } = useConfig();
  const [hours, setHours] = useState<OperatingHours[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<Booking[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setHours(operatingHours);
  }, [operatingHours]);

  const updateHour = (dow: number, field: keyof OperatingHours, value: string | boolean) => {
    setHours((prev) => prev.map((h) => (h.day_of_week === dow ? { ...h, [field]: value } : h)));
    setSaved(false);
  };

  const checkConflicts = async (): Promise<Booking[]> => {
    const allConflicts: Booking[] = [];
    for (const h of hours) {
      if (!h.is_open) {
        const { data } = await supabase
          .from('bookings')
          .select('*')
          .eq('status', 'confirmed')
          .gte('starts_at', new Date().toISOString());
        if (data) {
          for (const b of data as Booking[]) {
            const bDate = new Date(b.starts_at);
            if (bDate.getDay() === h.day_of_week) {
              allConflicts.push(b);
            }
          }
        }
      } else {
        const { data } = await supabase
          .from('bookings')
          .select('*')
          .eq('status', 'confirmed')
          .gte('starts_at', new Date().toISOString());
        if (data) {
          for (const b of data as Booking[]) {
            const bDate = new Date(b.starts_at);
            if (bDate.getDay() === h.day_of_week) {
              const bTime = bDate.toTimeString().slice(0, 5);
              if (bTime < h.open_time || bTime >= h.close_time) {
                allConflicts.push(b);
              }
            }
          }
        }
      }
    }
    return allConflicts;
  };

  const handleSave = async () => {
    setSaving(true);
    setConflicts([]);

    setChecking(true);
    const found = await checkConflicts();
    setChecking(false);

    if (found.length > 0) {
      setConflicts(found);
      setSaving(false);
      return;
    }

    try {
      for (const h of hours) {
        const { error } = await supabase
          .from('operating_hours')
          .update({ is_open: h.is_open, open_time: h.open_time, close_time: h.close_time })
          .eq('day_of_week', h.day_of_week);
        if (error) throw error;
      }
      setSaved(true);
      await reload();
    } catch (err) {
      console.error('Failed to save hours:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleForceSave = async () => {
    setSaving(true);
    setConflicts([]);
    try {
      for (const h of hours) {
        const { error } = await supabase
          .from('operating_hours')
          .update({ is_open: h.is_open, open_time: h.open_time, close_time: h.close_time })
          .eq('day_of_week', h.day_of_week);
        if (error) throw error;
      }
      setSaved(true);
      await reload();
    } catch (err) {
      console.error('Failed to save hours:', err);
    } finally {
      setSaving(false);
    }
  };

  if (hours.length === 0) {
    return <div className="text-center py-8"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Day</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Open</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Open time</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Close time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {hours.map((h) => (
              <tr key={h.day_of_week}>
                <td className="px-4 py-3 font-medium text-gray-900">{WEEKDAY_NAMES_FULL[h.day_of_week]}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => updateHour(h.day_of_week, 'is_open', !h.is_open)}
                    className={`relative w-11 h-6 rounded-full transition-colors touch-manipulation ${h.is_open ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${h.is_open ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="time"
                    value={h.open_time}
                    disabled={!h.is_open}
                    onChange={(e) => updateHour(h.day_of_week, 'open_time', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="time"
                    value={h.close_time}
                    disabled={!h.is_open}
                    onChange={(e) => updateHour(h.day_of_week, 'close_time', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {hours.map((h) => (
          <div key={h.day_of_week} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900">{WEEKDAY_NAMES_FULL[h.day_of_week]}</span>
              <button
                onClick={() => updateHour(h.day_of_week, 'is_open', !h.is_open)}
                className={`relative w-12 h-7 rounded-full transition-colors touch-manipulation ${h.is_open ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${h.is_open ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {h.is_open ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Open</label>
                  <input
                    type="time"
                    value={h.open_time}
                    onChange={(e) => updateHour(h.day_of_week, 'open_time', e.target.value)}
                    className="w-full px-2 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Close</label>
                  <input
                    type="time"
                    value={h.close_time}
                    onChange={(e) => updateHour(h.day_of_week, 'close_time', e.target.value)}
                    className="w-full px-2 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-base"
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-1">Closed all day</div>
            )}
          </div>
        ))}
      </div>

      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">
                {conflicts.length} confirmed booking{conflicts.length > 1 ? 's' : ''} would fall outside the new hours:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {conflicts.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    {b.reference} — {b.booker_name} — {new Date(b.starts_at).toLocaleString('en-GB')}
                  </li>
                ))}
                {conflicts.length > 5 && <li>…and {conflicts.length - 5} more</li>}
              </ul>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleForceSave}
                  disabled={saving}
                  className="px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 touch-manipulation"
                >
                  Save anyway
                </button>
                <button
                  onClick={() => setConflicts([])}
                  className="px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 touch-manipulation"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save button */}
      {conflicts.length === 0 && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || checking}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 touch-manipulation"
          >
            {saving || checking ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {checking ? 'Checking…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
        </div>
      )}
    </div>
  );
}
