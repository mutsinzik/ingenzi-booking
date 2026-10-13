import { useEffect, useState, useCallback } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'booked'; reference: string; cancelToken: string; startsAt: string; endsAt: string; bookerName: string; emailSent: boolean; emailError: string | null }
  | { name: 'cancel'; token: string }
  | { name: 'find' }
  | { name: 'admin' };

function parseHash(): Route {
  const hash = window.location.hash.slice(1);
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');

  switch (path) {
    case '/booked': {
      const reference = params.get('reference') ?? '';
      const cancelToken = params.get('cancel_token') ?? '';
      const startsAt = params.get('starts_at') ?? '';
      const endsAt = params.get('ends_at') ?? '';
      const bookerName = params.get('booker_name') ?? '';
      const emailSent = params.get('email_sent') !== 'false';
      const emailError = params.get('email_error');
      return { name: 'booked', reference, cancelToken, startsAt, endsAt, bookerName, emailSent, emailError };
    }
    case '/cancel': {
      const token = params.get('token') ?? '';
      return { name: 'cancel', token };
    }
    case '/find':
      return { name: 'find' };
    case '/admin':
      return { name: 'admin' };
    default:
      return { name: 'home' };
  }
}

export function buildHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'booked': {
      const params = new URLSearchParams({
        reference: route.reference,
        cancel_token: route.cancelToken,
        starts_at: route.startsAt,
        ends_at: route.endsAt,
        booker_name: route.bookerName,
        email_sent: route.emailSent ? 'true' : 'false',
        email_error: route.emailError ?? '',
      });
      return `#/booked?${params.toString()}`;
    }
    case 'cancel':
      return `#/cancel?token=${route.token}`;
    case 'find':
      return '#/find';
    case 'admin':
      return '#/admin';
  }
}

export function navigate(route: Route) {
  window.location.hash = buildHash(route);
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigateTo = useCallback((r: Route) => {
    window.location.hash = buildHash(r);
  }, []);

  return { route, navigateTo };
}
