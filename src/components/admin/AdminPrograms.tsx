import { useCallback, useEffect, useState } from 'react';
import { supabase, type ProgramBlock } from '@/lib/supabase';
import { WEEKDAY_NAMES_FULL } from '@/lib/time';
import { useConfig } from '@/hooks/useConfig';
import { Loader2, Trash2, Plus } from 'lucide-react';

const todayString = () => new Date().toISOString().slice(0, 10);

const formatTime = (t: string) => t.slice(0, 5);

const formatDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

export function AdminPrograms() {
  const { reload: reloadConfig } = useConfig();
  const [programs, setPrograms] = useState<ProgramBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState(6);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [hasLastOverride, setHasLastOverride] = useState(false);
  const [lastStartTime, setLastStartTime] = useState('12:00');
  const [lastEndTime, setLastEndTime] = useState('14:00');
  const [firstDate, setFirstDate] = useState('');
  const [lastDate, setLastDate] = useState('');

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('program_blocks')
      .select('*')
      .order('first_date');
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setPrograms((data ?? []) as ProgramBlock[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const resetForm = () => {
    setName('');
    setWeekday(6);
    setStartTime('09:00');
    setEndTime('11:00');
    setHasLastOverride(false);
    setLastStartTime('12:00');
    setLastEndTime('14:00');
    setFirstDate('');
    setLastDate('');
    setFormError(null);
  };

  const openForm = () => {
    resetForm();
    setFirstDate(todayString());
    setLastDate(todayString());
    setNotice(null);
    setAdding(true);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('Please give the program a name');
    if (!firstDate || !lastDate) return setFormError('Please set the first and last dates');
    if (lastDate < firstDate) return setFormError('The last date must be on or after the first date');
    if (endTime <= startTime) return setFormError('End time must be after start time');
    if (hasLastOverride && lastEndTime <= lastStartTime) {
      return setFormError('Last-occurrence end time must be after its start time');
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('create_program_block', {
        p_name: name.trim(),
        p_weekday: weekday,
        p_start: startTime,
        p_end: endTime,
        p_last_start: hasLastOverride ? lastStartTime : null,
        p_last_end: hasLastOverride ? lastEndTime : null,
        p_first_date: firstDate,
        p_last_date: lastDate,
      });
      if (error) throw error;
      const result = data as { id: string; conflicting_bookings: number } | null;
      const conflicts = result?.conflicting_bookings ?? 0;
      setNotice(
        conflicts > 0
          ? `Program added. ${conflicts} existing booking${conflicts === 1 ? ' falls' : 's fall'} inside its times and ${conflicts === 1 ? 'was' : 'were'} left in place. Review them in Bookings.`
          : 'Program added and its slots are now locked.',
      );
      setAdding(false);
      resetForm();
      await Promise.all([loadPrograms(), reloadConfig()]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add program');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (program: ProgramBlock) => {
    if (!window.confirm(`Remove "${program.name}" and unlock all of its slots?`)) return;
    setLoadError(null);
    const { error } = await supabase.from('program_blocks').delete().eq('id', program.id);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setNotice(`"${program.name}" was removed and its slots are open again.`);
    await Promise.all([loadPrograms(), reloadConfig()]);
  };

  const describeSchedule = (p: ProgramBlock) => {
    const base = `Every ${WEEKDAY_NAMES_FULL[p.weekday]} ${formatTime(p.start_time)}–${formatTime(p.end_time)}`;
    if (p.last_occurrence_start_time && p.last_occurrence_end_time) {
      return `${base}, last ${WEEKDAY_NAMES_FULL[p.weekday]} of the month ${formatTime(p.last_occurrence_start_time)}–${formatTime(p.last_occurrence_end_time)}`;
    }
    return base;
  };

  return (
    <div>
      {notice && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4 flex justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-blue-600 hover:underline flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg border border-gray-200 mb-4">
          <p className="text-gray-500">No recurring programs yet. Add one to lock its slots across the calendar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 mb-4">
          {programs.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-600 mt-0.5">{describeSchedule(p)}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatDate(p.first_date)} – {formatDate(p.last_date)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(p)}
                aria-label={`Remove ${p.name}`}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-1">Add a program</h3>
          <p className="text-xs text-gray-500 mb-4">
            Its slots are locked on the calendar for every matching day in the date range.
          </p>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Program name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="U14 Program"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {WEEKDAY_NAMES_FULL.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasLastOverride}
              onChange={(e) => setHasLastOverride(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Different times on the last {WEEKDAY_NAMES_FULL[weekday]} of each month
          </label>

          {hasLastOverride && (
            <div className="grid grid-cols-2 gap-3 mb-3 pl-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last start time</label>
                <input
                  type="time"
                  value={lastStartTime}
                  onChange={(e) => setLastStartTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last end time</label>
                <input
                  type="time"
                  value={lastEndTime}
                  onChange={(e) => setLastEndTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First date</label>
              <input
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last date</label>
              <input
                type="date"
                value={lastDate}
                onChange={(e) => setLastDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Lock slots'}
            </button>
            <button
              onClick={() => { setAdding(false); resetForm(); }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} /> Add program
        </button>
      )}
    </div>
  );
}
