import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { EventsPage } from './pages/EventsPage';
import { EventDetailsPage } from './pages/EventDetailsPage';
import { RegisterEventPage } from './pages/RegisterEventPage';
import { RegistrationsPage } from './pages/RegistrationsPage';
import { StudentsPage } from './pages/StudentsPage';
import { StudentImportPage } from './pages/StudentImportPage';
import { CoordinatorsPage } from './pages/CoordinatorsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/common/ProtectedRoute';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppShell>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Initial One-Time Setup Bootstrap Route */}
              <Route path="/setup" element={<SetupPage />} />

              {/* Dashboard: All authenticated active roles */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Events: All roles */}
              <Route
                path="/events"
                element={
                  <ProtectedRoute
                    allowedRoles={['super_coordinator', 'view_coordinator', 'year_coordinator']}
                  >
                    <EventsPage />
                  </ProtectedRoute>
                }
              />

              {/* Event Details: All roles */}
              <Route
                path="/events/:eventId"
                element={
                  <ProtectedRoute
                    allowedRoles={['super_coordinator', 'view_coordinator', 'year_coordinator']}
                  >
                    <EventDetailsPage />
                  </ProtectedRoute>
                }
              />

              {/* Register Event: Year Coordinator & Super Coordinator */}
              <Route
                path="/events/:eventId/register"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator', 'year_coordinator']}>
                    <RegisterEventPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/events/:eventId/edit-registration/:registrationId"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator', 'year_coordinator']}>
                    <RegisterEventPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/register/:eventId"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator', 'year_coordinator']}>
                    <RegisterEventPage />
                  </ProtectedRoute>
                }
              />

              {/* Registrations: All roles (Year Coordinator scoped to assigned class) */}
              <Route
                path="/registrations"
                element={
                  <ProtectedRoute
                    allowedRoles={['super_coordinator', 'view_coordinator', 'year_coordinator']}
                  >
                    <RegistrationsPage />
                  </ProtectedRoute>
                }
              />

              {/* Students: Super Coordinator and Year Coordinator */}
              <Route
                path="/students"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator', 'year_coordinator']}>
                    <StudentsPage />
                  </ProtectedRoute>
                }
              />

              {/* Excel Student Import: Super Coordinator only */}
              <Route
                path="/students/import"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator']}>
                    <StudentImportPage />
                  </ProtectedRoute>
                }
              />

              {/* Coordinators: Super Coordinator only */}
              <Route
                path="/coordinators"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator']}>
                    <CoordinatorsPage />
                  </ProtectedRoute>
                }
              />

              {/* Reports: All roles */}
              <Route
                path="/reports"
                element={
                  <ProtectedRoute
                    allowedRoles={['super_coordinator', 'view_coordinator', 'year_coordinator']}
                  >
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />

              {/* Activity Log: Super Coordinator only */}
              <Route
                path="/activity-log"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator']}>
                    <ActivityLogPage />
                  </ProtectedRoute>
                }
              />

              {/* Settings: Super Coordinator only */}
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['super_coordinator']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AppShell>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
