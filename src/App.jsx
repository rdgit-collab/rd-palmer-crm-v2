import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/sales/Customers'
import Contacts from './pages/sales/Contacts'
import Leads from './pages/sales/Leads'
import Activities from './pages/sales/Activities'
import Quotations from './pages/sales/Quotations'
import Invoices from './pages/sales/Invoices'
import Tickets from './pages/service/Tickets'
import Tasks from './pages/service/Tasks'
import OnsiteTickets from './pages/service/OnsiteTickets'
import RMA from './pages/service/RMA'
import Calibration from './pages/service/Calibration'
import SerialNumbers from './pages/service/SerialNumbers'
import Users from './pages/admin/Users'
import Catalogue from './pages/admin/Catalogue'
import Settings from './pages/admin/Settings'
import Profile from './pages/Profile'

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">Loading...</span>
      </div>
    </div>
  )
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
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
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
