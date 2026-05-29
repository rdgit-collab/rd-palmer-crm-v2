import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'

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
const Users = lazy(() => import('./pages/admin/Users'))
const Catalogue = lazy(() => import('./pages/admin/Catalogue'))
const Settings = lazy(() => import('./pages/admin/Settings'))
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

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
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
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardModule />} />
          <Route path="sales-dashboard"   element={<SalesDashboardPage />} />
          <Route path="service-dashboard" element={<ServiceDashboardPage />} />
          <Route path="customers"     element={<PermissionRoute module="customers">   <Customers />   </PermissionRoute>} />
          <Route path="contacts"      element={<PermissionRoute module="contacts">    <Contacts />    </PermissionRoute>} />
          <Route path="leads"         element={<PermissionRoute module="leads">       <Leads />       </PermissionRoute>} />
          <Route path="activities"    element={<PermissionRoute module="activities">  <Activities />  </PermissionRoute>} />
          <Route path="quotations"    element={<PermissionRoute module="quotations">  <Quotations />  </PermissionRoute>} />
          <Route path="invoices"      element={<PermissionRoute module="invoices">    <Invoices />    </PermissionRoute>} />
          <Route path="tickets"       element={<PermissionRoute module="tickets">     <Tickets />     </PermissionRoute>} />
          <Route path="tasks"         element={<PermissionRoute module="tasks">       <Tasks />       </PermissionRoute>} />
          <Route path="onsite-tickets"element={<PermissionRoute module="onsite-tickets"><OnsiteTickets /></PermissionRoute>} />
          <Route path="rma"           element={<PermissionRoute module="rma">         <RMA />         </PermissionRoute>} />
          <Route path="calibration"   element={<PermissionRoute module="calibration"> <Calibration /> </PermissionRoute>} />
          <Route path="serial-numbers"element={<PermissionRoute module="serial-numbers"><SerialNumbers /></PermissionRoute>} />
          <Route path="catalogue"     element={<ProtectedRoute roles={[1]}><Catalogue /></ProtectedRoute>} />
          <Route path="admin/users"   element={<ProtectedRoute roles={[1]}><Users /></ProtectedRoute>} />
          <Route path="settings"      element={<ProtectedRoute roles={[1]}><Settings /></ProtectedRoute>} />
          <Route path="profile"       element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
