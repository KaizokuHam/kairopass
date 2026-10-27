import { Route, Routes } from 'react-router';
import { lazy, Suspense } from 'react';
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
import { MyTicketsPage } from '@/pages/attendee/MyTicketsPage';
const TicketDetailsPage = lazy(() => import('@/pages/attendee/TicketDetailsPage').then((module) => ({ default: module.TicketDetailsPage })));
const EventCheckInPage = lazy(() => import('@/pages/organizer/EventCheckInPage').then((module) => ({ default: module.EventCheckInPage })));
const OrganizerAnalyticsPage = lazy(() => import('@/pages/organizer/OrganizerAnalyticsPage').then((module) => ({ default: module.OrganizerAnalyticsPage })));

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
            <Route path="attendee/tickets" element={<AttendeeLayout />}><Route index element={<MyTicketsPage />} /><Route path=":id" element={<Suspense fallback={<p role="status">Loading ticket…</p>}><TicketDetailsPage /></Suspense>} /></Route>
          </Route>
          <Route element={<RoleGuard role="ORGANIZER" />}><Route path="organizer/dashboard" element={<DashboardPage role="ORGANIZER" />} />
            <Route element={<OrganizerLayout />}><Route path="organizer/analytics" element={<Suspense fallback={<p role="status">Loading analytics…</p>}><OrganizerAnalyticsPage /></Suspense>} /><Route path="organizer/events/:id/analytics" element={<Suspense fallback={<p role="status">Loading event analytics…</p>}><OrganizerAnalyticsPage /></Suspense>} /></Route>
            <Route path="organizer/events" element={<OrganizerLayout />}><Route index element={<OrganizerEventsPage />} /><Route path="new" element={<CreateEventPage />} />
              <Route path=":id" element={<OrganizerEventDetailsPage />} /><Route path=":id/edit" element={<EditEventPage />} /><Route path=":id/check-in" element={<Suspense fallback={<p role="status">Loading admission workspace…</p>}><EventCheckInPage /></Suspense>} /></Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></PaymentRecoveryProvider>
  );
}
