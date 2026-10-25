import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Layout } from '../components/Layout'
import { SignInForm } from '../components/SignInForm'
import { signOut } from '../lib/auth'

// Funeral home accounts are seeded (scripts/seed-funeral-home-users.ts).
export function FuneralHomeLogin() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <Layout variant="funeral">
        <p className="center-note">Loading…</p>
      </Layout>
    )
  }
  if (session && profile?.role === 'funeral_home') return <Navigate to="/funeral-home/dashboard" replace />

  // Signed in with a different kind of account (family or hospital). Say so, and let them sign out.
  if (session && profile && profile.role !== 'funeral_home') {
    return (
      <Layout variant="funeral">
        <div className="page-narrow" style={{ margin: '2rem auto 0', maxWidth: 420, padding: 0 }}>
          <p className="eyebrow">Funeral home portal</p>
          <h1>Wrong account</h1>
          <div className="banner banner-error" role="alert">
            This account isn't set up for the funeral home portal. Sign out, then sign in with the email your funeral
            home was given.
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout variant="funeral">
      <div className="page-narrow" style={{ margin: '2rem auto 0', maxWidth: 420, padding: 0 }}>
        <p className="eyebrow">Funeral home portal</p>
        <h1>Sign in</h1>
        <p>Sign in with the email and password your funeral home was given.</p>
        <div className="card">
          <SignInForm />
        </div>
        <p className="field-hint" style={{ marginTop: '1rem' }}>
          Not a funeral home? <a href="/">Go back to the homepage</a>.
        </p>
      </div>
    </Layout>
  )
}
