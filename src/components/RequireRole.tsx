import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/auth'

export function RequireRole({
  role,
  loginPath = `/${role}/login`,
  children,
}: {
  role: Role
  loginPath?: string
  children: ReactNode
}) {
  const { session, profile, loading } = useAuth()

  if (loading) return <p>Loading…</p>
  if (!session || !profile) return <Navigate to={loginPath} replace />
  if (profile.role !== role) return <Navigate to="/" replace />

  return <>{children}</>
}
