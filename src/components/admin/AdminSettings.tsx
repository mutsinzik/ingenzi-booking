import { useState } from 'react';
import { supabase, type Settings } from '@/lib/supabase';
import { Loader2, Save } from 'lucide-react';

type AdminSettingsProps = {
  settings: Settings | null;
  onUpdate: () => void;
};

export function AdminSettings({ settings, onUpdate }: AdminSettingsProps) {
  const [form, setForm] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when settings prop changes
  if (settings && form && form.id !== settings.id) {
    setForm(settings);
  }
  if (settings && !form) {
    setForm(settings);
  }

  const update = (field: keyof Settings, value: string | number) => {
    if (!form) return;
    setForm({ ...form, [field]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('settings')
        .update({
          court_name: form.court_name,
          slot_minutes: form.slot_minutes,
          max_hours_per_day_per_email: form.max_hours_per_day_per_email,
          max_hours_per_booking: form.max_hours_per_booking,
          max_days_ahead: form.max_days_ahead,
          min_advance_minutes: form.min_advance_minutes,
          timezone: form.timezone,
        })
        .eq('id', 1);
      if (updateError) throw updateError;
      onUpdate();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return <div className="text-center py-8"><Loader2 size={24} className="animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Court name</label>
          <input
            type="text"
            value={form.court_name}
            onChange={(e) => update('court_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slot length (minutes)</label>
          <input
            type="number"
            min={15}
            max={240}
            value={form.slot_minutes}
            onChange={(e) => update('slot_minutes', parseInt(e.target.value) || 60)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">15–240 minutes. Each slot on the calendar is this long.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max hours/day per email</label>
            <input
              type="number"
              min={1}
              max={24}
              value={form.max_hours_per_day_per_email}
              onChange={(e) => update('max_hours_per_day_per_email', parseInt(e.target.value) || 4)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max hours per booking</label>
            <input
              type="number"
              min={1}
              max={24}
              value={form.max_hours_per_booking}
              onChange={(e) => update('max_hours_per_booking', parseInt(e.target.value) || 4)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Booking horizon (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={form.max_days_ahead}
              onChange={(e) => update('max_days_ahead', parseInt(e.target.value) || 14)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">How far in advance people can book.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min advance (minutes)</label>
            <input
              type="number"
              min={0}
              value={form.min_advance_minutes}
              onChange={(e) => update('min_advance_minutes', parseInt(e.target.value) || 60)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum notice before a slot starts.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input
            type="text"
            value={form.timezone}
            onChange={(e) => update('timezone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">IANA timezone, e.g. Africa/Kigali.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save settings
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
        </div>
      </div>
    </div>
  );
}
