import { useRouter } from '@/hooks/useRouter';
import { HomePage } from '@/pages/HomePage';
import { BookedPage } from '@/pages/BookedPage';
import { CancelPage } from '@/pages/CancelPage';
import { FindPage } from '@/pages/FindPage';
import { AdminPage } from '@/pages/AdminPage';

function App() {
  const { route } = useRouter();

  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'booked':
      return (
        <BookedPage
          reference={route.reference}
          cancelToken={route.cancelToken}
          startsAt={route.startsAt}
          endsAt={route.endsAt}
          bookerName={route.bookerName}
          emailSent={route.emailSent}
          emailError={route.emailError}
        />
      );
    case 'cancel':
      return <CancelPage token={route.token} />;
    case 'find':
      return <FindPage />;
    case 'admin':
      return <AdminPage />;
    default:
      return <HomePage />;
  }
}

export default App;
