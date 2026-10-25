import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { startAnonymousFamilySession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { stashInviteToken } from '../lib/familyOnboarding'

type LookupState = { status: 'loading' } | { status: 'invalid' } | { status: 'valid' }

interface InviteTokenLookupRow {
  valid: boolean
  contact_email: string
  case_id: string
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const [lookup, setLookup] = useState<LookupState>({ status: 'loading' })
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setLookup({ status: 'invalid' })
      return
    }
    supabase
      .rpc('invite_token_lookup', { p_token: token })
      .single<InviteTokenLookupRow>()
      .then(({ data, error }) => {
        setLookup(error || !data || !data.valid ? { status: 'invalid' } : { status: 'valid' })
      })
  }, [token])

  if (lookup.status === 'loading') {
    return (
      <Layout>
        <p className="center-note">Checking your invite…</p>
      </Layout>
    )
  }

  if (lookup.status === 'invalid') {
    return (
      <Layout>
        <h1>This link isn't active</h1>
        <p>
          It may have already been used, or it's expired. Please contact the hospital that sent it
          and ask them to resend your invite — it only takes them a moment.
        </p>
      </Layout>
    )
  }

  // The invite link is the credential now that email sign-in is gone, so the
  // family gets an anonymous session and the link is redeemed on the case page.
  async function handleContinue() {
    setStarting(true)
    setError('')
    try {
      stashInviteToken(token!)
      await startAnonymousFamilySession()
      window.location.assign('/case')
    } catch (err) {
      setStarting(false)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <Layout>
      <p className="eyebrow">You've been invited</p>
      <h1>Let's get you started</h1>
      <p className="lede">
        A hospital shared some details with us to help find the right funeral home. Continue below to
        review them and see your options. No password or email is needed.
      </p>
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={starting} onClick={handleContinue}>
          {starting ? 'Starting…' : 'Continue to your case'}
        </button>
      </div>
    </Layout>
  )
}
