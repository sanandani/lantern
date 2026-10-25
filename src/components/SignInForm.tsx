import { useState } from 'react'
import { signInStaff } from '../lib/auth'
import { Field } from './Field'

// Staff sign-in (hospital and funeral home). The auth context picks up the new
// session, and the page's Navigate redirects to the dashboard.
export function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('signing-in')
    try {
      await signInStaff(email, password)
    } catch (err) {
      setStatus('error')
      const raw = err instanceof Error ? err.message : ''
      setErrorMessage(
        raw.includes('Invalid login credentials')
          ? "That email and password don't match an account. Check them and try again."
          : raw.includes('Email not confirmed')
            ? 'This account has not been activated yet. Contact your administrator.'
            : raw || 'Something went wrong. Please try again.',
      )
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Email address" htmlFor="signin-email">
        <input
          id="signin-email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="signin-password">
        <input
          id="signin-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn-primary btn-block" disabled={status === 'signing-in'}>
        {status === 'signing-in' ? (
          <>
            <span className="spinner" aria-hidden="true" /> Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </button>
      {status === 'error' && (
        <p className="error-text" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
