import { useState, useEffect, useCallback } from 'react';
import { supabase, type Settings } from '@/lib/supabase';
import { Loader2, LogOut, Calendar, List, Clock, Ban, Sliders, BarChart3 } from 'lucide-react';
import { AdminBookings } from '@/components/admin/AdminBookings';
import { AdminDayView } from '@/components/admin/AdminDayView';
import { AdminHours } from '@/components/admin/AdminHours';
import { AdminClosures } from '@/components/admin/AdminClosures';
import { AdminSettings } from '@/components/admin/AdminSettings';
import { AdminStats } from '@/components/admin/AdminStats';
import { navigate } from '@/hooks/useRouter';
import { ArrowLeft } from 'lucide-react';

type Tab = 'bookings' | 'day' | 'hours' | 'closures' | 'settings';

export function AdminPage() {
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [tab, setTab] = useState<Tab>('bookings');
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
        checkAdmin(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        if (sess) {
          setSession(sess);
          await checkAdmin(sess.user.id);
        } else {
          setSession(null);
          setIsAdmin(false);
          setLoading(false);
        }
      })();
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const checkAdmin = useCallback(async (_userId: string) => {
    const { data, error } = await supabase.rpc('is_admin');
    if (error) {
      setIsAdmin(false);
    } else {
      setIsAdmin(data === true);
    }
    setLoading(false);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    if (isAdmin) {
      supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
        if (data) setSettings(data as Settings);
      });
    }
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full">
          <button
            onClick={() => navigate({ name: 'home' })}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft size={16} /> Back to calendar
          </button>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <BarChart3 size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Admin sign in</h1>
                <p className="text-sm text-gray-500">Manage bookings and settings.</p>
              </div>
            </div>
            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                  required
                  autoComplete="current-password"
                />
              </div>
              {authError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {authError}
                </div>
              )}
              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 flex items-center justify-center gap-2 touch-manipulation"
              >
                {signingIn ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900">Not authorised</h1>
          <p className="text-gray-600 mt-2">
            Your account does not have admin access. Contact the system administrator.
          </p>
          <button onClick={handleSignOut} className="mt-4 text-blue-600 hover:underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
    { id: 'bookings', label: 'Bookings', icon: List },
    { id: 'day', label: 'Day view', icon: Calendar },
    { id: 'hours', label: 'Hours', icon: Clock },
    { id: 'closures', label: 'Closures', icon: Ban },
    { id: 'settings', label: 'Settings', icon: Sliders },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-gray-900 leading-tight truncate">
                {settings?.court_name ?? 'Court'} — Admin
              </h1>
              <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0 px-2 py-2 touch-manipulation"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <AdminStats />
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap touch-manipulation ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'bookings' && <AdminBookings />}
        {tab === 'day' && <AdminDayView settings={settings} />}
        {tab === 'hours' && <AdminHours />}
        {tab === 'closures' && <AdminClosures />}
        {tab === 'settings' && <AdminSettings settings={settings} onUpdate={setSettings} />}
      </main>
    </div>
  );
}
