import { Navigate, Outlet } from 'react-router-dom'
import { isAuthenticated } from '../api/client'

/**
 * Route guard: redirects to /login if not authenticated.
 * Wraps protected routes so unauthenticated users cannot access them.
 */
export default function AuthGuard() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
