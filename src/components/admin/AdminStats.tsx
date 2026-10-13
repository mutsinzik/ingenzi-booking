import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarCheck, CalendarX, TrendingUp } from 'lucide-react';

type Stats = {
  bookingsThisWeek: number;
  cancellationsThisWeek: number;
  utilisation: number;
};

export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const weekStartIso = weekStart.toISOString();

      const { data: weekBookings } = await supabase
        .from('bookings')
        .select('*')
        .gte('created_at', weekStartIso);

      const all = weekBookings ?? [];
      const confirmed = all.filter((b) => b.status === 'confirmed');
      const cancelled = all.filter((b) => b.status === 'cancelled');

      let availableMinutes = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dow = d.getDay();
        const { data: hours } = await supabase
          .from('operating_hours')
          .select('is_open, open_time, close_time')
          .eq('day_of_week', dow)
          .maybeSingle();
        if (hours?.is_open) {
          const [oh, om] = hours.open_time.split(':').map(Number);
          const [ch, cm] = hours.close_time.split(':').map(Number);
          availableMinutes += (ch * 60 + cm) - (oh * 60 + om);
        }
      }

      let bookedMinutes = 0;
      for (const b of confirmed) {
        const dur = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000;
        bookedMinutes += dur;
      }

      const utilisation = availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : 0;

      setStats({
        bookingsThisWeek: confirmed.length,
        cancellationsThisWeek: cancelled.length,
        utilisation,
      });
    })();
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 h-16 sm:h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <CalendarCheck size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Bookings</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.bookingsThisWeek}</div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <CalendarX size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Cancellations</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.cancellationsThisWeek}</div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-gray-500 mb-1">
          <TrendingUp size={14} className="flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium uppercase leading-tight">Utilisation</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.utilisation}%</div>
      </div>
    </div>
  );
}
