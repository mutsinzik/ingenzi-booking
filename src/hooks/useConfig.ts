import { useState, useEffect, useCallback } from 'react';
import { supabase, type Settings, type OperatingHours, type Closure } from '@/lib/supabase';

export function useConfig() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [operatingHours, setOperatingHours] = useState<OperatingHours[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [settingsRes, hoursRes, closuresRes] = await Promise.all([
        supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('operating_hours').select('*').order('day_of_week'),
        supabase.from('closures').select('*').order('starts_at'),
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (hoursRes.error) throw hoursRes.error;
      if (closuresRes.error) throw closuresRes.error;

      setSettings(settingsRes.data as Settings);
      setOperatingHours((hoursRes.data ?? []) as OperatingHours[]);
      setClosures((closuresRes.data ?? []) as Closure[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, operatingHours, closures, loading, error, reload: load };
}
