import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SignInForm } from '../components/SignInForm'
import { HospitalLayout } from '../components/HospitalLayout'

export function HospitalLogin() {
  const { session, profile, loading } = useAuth()

  if (loading) return <HospitalLayout><p className="center-note">Loading…</p></HospitalLayout>
  if (session && profile?.role === 'hospital') return <Navigate to="/hospital/dashboard" replace />

  return (
    <HospitalLayout>
      <div className="page-narrow" style={{ margin: '2rem auto 0', maxWidth: 420, padding: 0 }}>
        <p className="eyebrow">Hospital Portal</p>
        <h1>Sign in</h1>
        <p>Use your hospital staff email to receive a secure sign-in link.</p>
        <div className="card">
          <SignInForm role="hospital" redirectTo={`${window.location.origin}/hospital/dashboard`} />
        </div>
      </div>
    </HospitalLayout>
  )
}
