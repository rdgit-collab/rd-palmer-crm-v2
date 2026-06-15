import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import {
  ROLE_ADMIN,
  ROLE_SALES,
  ROLE_SALES_MANAGER,
  ROLE_SERVICE,
  ROLE_SUPER_ADMIN,
} from './lib/roles'

const Login = lazy(() => import('./pages/Login'))
const DashboardModule = lazy(() => import('./pages/Dashboard'))
const SalesDashboardPage = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.SalesDashboardPage })))
const ServiceDashboardPage = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.ServiceDashboardPage })))
const Customers = lazy(() => import('./pages/sales/Customers'))
const Contacts = lazy(() => import('./pages/sales/Contacts'))
const Leads = lazy(() => import('./pages/sales/Leads'))
const Activities = lazy(() => import('./pages/sales/Activities'))
const Quotations = lazy(() => import('./pages/sales/Quotations'))
const Invoices = lazy(() => import('./pages/sales/Invoices'))
const Tickets = lazy(() => import('./pages/service/Tickets'))
const Tasks = lazy(() => import('./pages/service/Tasks'))
const OnsiteTickets = lazy(() => import('./pages/service/OnsiteTickets'))
const RMA = lazy(() => import('./pages/service/RMA'))
const Calibration = lazy(() => import('./pages/service/Calibration'))
const SerialNumbers = lazy(() => import('./pages/service/SerialNumbers'))
const Booking = lazy(() => import('./pages/Booking'))
const Training = lazy(() => import('./pages/Training'))
const TrainingSignup = lazy(() => import('./pages/TrainingSignup'))
const Users = lazy(() => import('./pages/admin/Users'))
const Catalogue = lazy(() => import('./pages/admin/Catalogue'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const ActivityLog = lazy(() => import('./pages/admin/ActivityLog'))
const Profile = lazy(() => import('./pages/Profile'))

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    </div>
  )
}

function AuthIssue({ message }) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md border border-red-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-gray-900">Unable to load account access</h1>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading, authError } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (authError) return <AuthIssue message={authError} />
  if (roles && profile && !roles.includes(profile.role_id)) return <Navigate to="/" replace />
  return children
}

// Redirects to "/" if the user's role permissions don't include this module
function PermissionRoute({ children, module }) {
  const { hasPermission, loading } = useAuth()
  if (loading) return null
  if (!hasPermission(module)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  const location = useLocation()
  const adminRoles = [ROLE_ADMIN, ROLE_SUPER_ADMIN]
  const salesRoles = [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_SALES, ROLE_SALES_MANAGER]
  const serviceRoles = [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_SERVICE]
  const sharedWorkRoles = [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_SALES, ROLE_SALES_MANAGER, ROLE_SERVICE]

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/training/signup/:slug" element={<TrainingSignup />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardModule />} />
            <Route path="sales-dashboard"   element={<ProtectedRoute roles={salesRoles}><SalesDashboardPage /></ProtectedRoute>} />
            <Route path="service-dashboard" element={<ProtectedRoute roles={serviceRoles}><ServiceDashboardPage /></ProtectedRoute>} />
            <Route path="customers"     element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="customers">   <Customers />   </PermissionRoute></ProtectedRoute>} />
            <Route path="contacts"      element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="contacts">    <Contacts />    </PermissionRoute></ProtectedRoute>} />
            <Route path="leads"         element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="leads">       <Leads />       </PermissionRoute></ProtectedRoute>} />
            <Route path="activities"    element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="activities">  <Activities />  </PermissionRoute></ProtectedRoute>} />
            <Route path="quotations"    element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="quotations">  <Quotations />  </PermissionRoute></ProtectedRoute>} />
            <Route path="invoices"      element={<ProtectedRoute roles={salesRoles}><PermissionRoute module="invoices">    <Invoices />    </PermissionRoute></ProtectedRoute>} />
            <Route path="tickets"       element={<ProtectedRoute roles={sharedWorkRoles}><PermissionRoute module="tickets">     <Tickets />     </PermissionRoute></ProtectedRoute>} />
            <Route path="tasks"         element={<ProtectedRoute roles={sharedWorkRoles}><PermissionRoute module="tasks">       <Tasks />       </PermissionRoute></ProtectedRoute>} />
            <Route path="onsite-tickets"element={<ProtectedRoute roles={serviceRoles}><PermissionRoute module="onsite-tickets"><OnsiteTickets /></PermissionRoute></ProtectedRoute>} />
            <Route path="rma"           element={<ProtectedRoute roles={serviceRoles}><PermissionRoute module="rma">         <RMA />         </PermissionRoute></ProtectedRoute>} />
            <Route path="calibration"   element={<ProtectedRoute roles={serviceRoles}><PermissionRoute module="calibration"> <Calibration /> </PermissionRoute></ProtectedRoute>} />
            <Route path="serial-numbers"element={<ProtectedRoute roles={serviceRoles}><PermissionRoute module="serial-numbers"><SerialNumbers /></PermissionRoute></ProtectedRoute>} />
            <Route path="booking"      element={<ProtectedRoute roles={sharedWorkRoles}><PermissionRoute module="booking">    <Booking />    </PermissionRoute></ProtectedRoute>} />
            <Route path="training"     element={<ProtectedRoute roles={sharedWorkRoles}><PermissionRoute module="training">   <Training />   </PermissionRoute></ProtectedRoute>} />
            <Route path="catalogue"     element={<ProtectedRoute roles={adminRoles}><Catalogue /></ProtectedRoute>} />
            <Route path="admin/users"   element={<ProtectedRoute roles={adminRoles}><Users /></ProtectedRoute>} />
            <Route path="settings"      element={<ProtectedRoute roles={adminRoles}><Settings /></ProtectedRoute>} />
            <Route path="admin/activity-log" element={<ProtectedRoute roles={[ROLE_SUPER_ADMIN]}><ActivityLog /></ProtectedRoute>} />
            <Route path="profile"       element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
