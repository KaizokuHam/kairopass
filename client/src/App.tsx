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

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="vision" element={<VisionPage />} />
        <Route element={<PublicOnlyRoute />}><Route path="login" element={<LoginPage />} /><Route path="register" element={<RegisterPage />} /></Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard role="ATTENDEE" />}><Route path="attendee/dashboard" element={<DashboardPage role="ATTENDEE" />} /></Route>
          <Route element={<RoleGuard role="ORGANIZER" />}><Route path="organizer/dashboard" element={<DashboardPage role="ORGANIZER" />} /></Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
