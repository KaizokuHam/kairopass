import { Route, Routes } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { VisionPage } from '@/pages/VisionPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PublicOnlyRoute } from '@/components/auth/PublicOnlyRoute';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { OrganizerLayout } from '@/layouts/OrganizerLayout';
import { OrganizerEventsPage } from '@/pages/organizer/OrganizerEventsPage';
import { CreateEventPage } from '@/pages/organizer/CreateEventPage';
import { EditEventPage } from '@/pages/organizer/EditEventPage';
import { OrganizerEventDetailsPage } from '@/pages/organizer/OrganizerEventDetailsPage';
import { ExploreEventsPage } from '@/pages/ExploreEventsPage';
import { PublicEventDetailsPage } from '@/pages/PublicEventDetailsPage';
import { AttendeeLayout } from '@/layouts/AttendeeLayout';
import { MyReservationsPage } from '@/pages/attendee/MyReservationsPage';
import { ReservationDetailsPage } from '@/pages/attendee/ReservationDetailsPage';
import { PaymentRecoveryProvider } from '@/context/PaymentRecoveryProvider';

export function App() {
  return (
    <PaymentRecoveryProvider><Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="vision" element={<VisionPage />} />
        <Route path="events" element={<ExploreEventsPage />} />
        <Route path="events/:id" element={<PublicEventDetailsPage />} />
        <Route element={<PublicOnlyRoute />}><Route path="login" element={<LoginPage />} /><Route path="register" element={<RegisterPage />} /></Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="ATTENDEE" />}><Route path="attendee/dashboard" element={<DashboardPage role="ATTENDEE" />} />
            <Route path="attendee/reservations" element={<AttendeeLayout />}><Route index element={<MyReservationsPage />} /><Route path=":id" element={<ReservationDetailsPage />} /></Route>
          </Route>
          <Route element={<RoleGuard role="ORGANIZER" />}><Route path="organizer/dashboard" element={<DashboardPage role="ORGANIZER" />} />
            <Route path="organizer/events" element={<OrganizerLayout />}><Route index element={<OrganizerEventsPage />} /><Route path="new" element={<CreateEventPage />} />
              <Route path=":id" element={<OrganizerEventDetailsPage />} /><Route path=":id/edit" element={<EditEventPage />} /></Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></PaymentRecoveryProvider>
  );
}
