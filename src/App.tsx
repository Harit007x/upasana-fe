import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/layout/AppShell"
import { Accommodation } from "@/routes/Accommodation"
import { AccommodationPlace } from "@/routes/AccommodationPlace"
import { isAdmin, isStaff, useSession } from "@/lib/auth-client"
import { AcceptInvite } from "@/routes/AcceptInvite"
import { EditMyRegistration } from "@/routes/EditMyRegistration"
import { EditRegistration } from "@/routes/EditRegistration"
import { AccessPending } from "@/routes/AccessPending"
import { AdminTeam } from "@/routes/AdminTeam"
import { Dashboard } from "@/routes/Dashboard"
import { Login } from "@/routes/Login"
import { NewRegistration } from "@/routes/NewRegistration"
import { PlaceEditor } from "@/routes/PlaceEditor"
import { Register } from "@/routes/Register"
import { RegistrationDetail } from "@/routes/RegistrationDetail"
import { Registrations } from "@/routes/Registrations"
import { PublicSchedule } from "@/routes/PublicSchedule"
import { Schedule } from "@/routes/Schedule"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Poll explicitly where data needs to stay fresh. The global
      // refetch-on-focus is off — it would otherwise fire a burst of requests
      // every time someone alt-tabs back.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
})

/**
 * Lets staff through to the registration desk.
 *
 * Signed out goes to the login screen. Signed in without a staff role (anyone
 * can create an account there) stops at a waiting screen: the API would refuse
 * every request anyway, and an empty dashboard full of errors explains nothing.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()

  // Render nothing rather than a redirect while the session is still being
  // resolved — redirecting first would bounce every signed-in user through
  // /login on a hard refresh.
  if (isPending) return null
  if (!session) return <Navigate to="/login" replace />
  if (!isStaff(session.user.role)) return <AccessPending />

  return <>{children}</>
}

/**
 * Admin-only screens, inside the staff area. Staff who follow a link here land
 * on the dashboard instead. This only hides the screen — every admin endpoint
 * checks the role again on the server.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  if (!isAdmin(session?.user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public: devotees register here without an account. */}
          <Route path="/register" element={<Register />} />
          {/* Public: a devotee changes their own, after an OTP on the contact number. */}
          <Route path="/register/edit" element={<EditMyRegistration />} />
          {/* Public: the published schedule, the link shared with devotees. */}
          <Route path="/schedule" element={<PublicSchedule />} />
          {/* Public: an invitee may not have an account yet. */}
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="registrations" element={<Registrations />} />
            <Route path="registrations/new" element={<NewRegistration />} />
            <Route path="registrations/:id" element={<RegistrationDetail />} />
            <Route
              path="registrations/:id/edit"
              element={<EditRegistration />}
            />
            <Route path="accommodation" element={<Accommodation />} />
            <Route
              path="accommodation/places/new"
              element={
                <RequireAdmin>
                  <PlaceEditor />
                </RequireAdmin>
              }
            />
            <Route
              path="accommodation/places/:id"
              element={<AccommodationPlace />}
            />
            <Route
              path="accommodation/places/:id/edit"
              element={
                <RequireAdmin>
                  <PlaceEditor />
                </RequireAdmin>
              }
            />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <AdminTeam />
                </RequireAdmin>
              }
            />
            {/* The editor. Devotees see the published copy at /schedule. */}
            <Route
              path="admin/schedule"
              element={
                <RequireAdmin>
                  <Schedule />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
