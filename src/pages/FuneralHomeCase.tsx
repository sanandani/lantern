import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  PROGRESS_STEPS,
  PROMPT_LABELS,
  formatUsd,
  latestByStep,
  stepLabel,
  type ProgressEvent,
  type PromptThread,
  type Quote,
  type QuoteRequest,
  type Selection,
} from '../lib/m2'
import { decedentName, type Case } from '../lib/types'

type StepKey = ProgressEvent['step']
const WORK_STEPS = PROGRESS_STEPS.filter((s) => s.key !== 'hospital_care') as { key: StepKey; label: string }[]

export function FuneralHomeCase() {
  const { caseId } = useParams()
  const [selection, setSelection] = useState<(Selection & { cases: Case }) | null | undefined>(undefined)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [threads, setThreads] = useState<PromptThread[]>([])
  const [personalRequested, setPersonalRequested] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!caseId) return
    const { data: sel } = await supabase
      .from('selections')
      .select('*, cases(*)')
      .eq('case_id', caseId)
      .eq('status', 'active')
      .maybeSingle()
    const s = sel as (Selection & { cases: Case }) | null
    setSelection(s)
    if (!s) return

    const [{ data: ev }, { data: th }, { data: q }, { data: req }] = await Promise.all([
      supabase.from('progress_events').select('*').eq('selection_id', s.id),
      supabase.from('prompt_threads').select('*').eq('case_id', caseId).eq('audience', 'funeral_home').order('created_at'),
      supabase
        .from('quotes')
        .select('*')
        .eq('case_id', caseId)
        .eq('funeral_home_id', s.funeral_home_id)
        .eq('disposition', s.disposition)
        .eq('status', 'sent')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('quote_requests')
        .select('change_requests')
        .eq('case_id', caseId)
        .eq('funeral_home_id', s.funeral_home_id)
        .eq('disposition', s.disposition),
    ])
    setEvents((ev ?? []) as ProgressEvent[])
    setThreads((th ?? []) as PromptThread[])
    setQuote(q as Quote | null)
    setPersonalRequested(((req ?? []) as Pick<QuoteRequest, 'change_requests'>[]).some((r) => r.change_requests.includes('personal_items')))
  }, [caseId])

  useEffect(() => {
    load()
  }, [load])

  if (selection === undefined) {
    return (
      <Layout variant="funeral">
        <p className="center-note">Loading…</p>
      </Layout>
    )
  }
  if (!selection) {
    return (
      <Layout variant="funeral">
        <h1>Case not found</h1>
        <Link to="/funeral-home/dashboard">Back to your cases</Link>
      </Layout>
    )
  }

  const c = selection.cases
  const latest = latestByStep(events)
  const completed = latest.get('completed')?.status === 'done'

  async function recordStep(step: StepKey, status: 'in_progress' | 'done' | 'skipped') {
    if (!selection) return
    setBusy(true)
    setError('')
    const note = drafts[step]?.trim() || null
    const { error: err } = await supabase
      .from('progress_events')
      .insert({ selection_id: selection.id, step, status, note })
    setBusy(false)
    if (err) setError("We couldn't save that update. Please try again.")
    else {
      setDrafts((d) => ({ ...d, [step]: '' }))
      await load()
    }
  }

  async function reply(thread: PromptThread) {
    const text = answers[thread.id]?.trim()
    if (!text) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('prompt_threads')
      .update({ answer: text, answered_at: new Date().toISOString() })
      .eq('id', thread.id)
    setBusy(false)
    if (err) setError("We couldn't send your reply. Please try again.")
    else await load()
  }

  return (
    <Layout variant="funeral" wide>
      <p className="eyebrow">
        <Link to="/funeral-home/dashboard">← Your cases</Link>
      </p>
      <h1>{decedentName(c)}</h1>
      <p className="lede">
        {selection.disposition === 'burial' ? 'Burial' : 'Cremation'}
        {completed ? ' · Completed' : ' · In progress'}
      </p>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <h2>Details for your paperwork</h2>
        <dl className="details">
          <dt>Date of death</dt>
          <dd>{c.date_of_death ?? '—'}</dd>
          <dt>Date of birth</dt>
          <dd>{c.date_of_birth ?? '—'}</dd>
          <dt>Age at death</dt>
          <dd>{c.age_at_death ?? '—'}</dd>
          <dt>Residence</dt>
          <dd>
            {[c.residence_street, c.residence_city, c.residence_state, c.residence_zip].filter(Boolean).join(', ') || '—'}
            {c.residence_county ? ` (${c.residence_county} County)` : ''}
          </dd>
          <dt>Family contact</dt>
          <dd>
            {[c.family_contact_name, c.family_contact_relationship].filter(Boolean).join(', ') || '—'}
            {c.family_contact_email ? ` · ${c.family_contact_email}` : ''}
          </dd>
          <dt>Accepted quote</dt>
          <dd>{quote ? `${formatUsd(quote.total)} (version ${quote.version})` : 'No quote sent yet'}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Progress</h2>
        <ol style={{ listStyle: 'none', padding: 0 }}>
          {WORK_STEPS.map((step) => {
            if (step.key === 'personal_items' && !personalRequested) return null
            const ev = latest.get(step.key)
            return (
              <li key={step.key} style={{ padding: '0.75rem 0', borderTop: '1px solid var(--border, #e5e5e5)' }}>
                <div>
                  <strong>{stepLabel(step.key, selection.disposition)}</strong>{' '}
                  <span className="field-hint">
                    {ev ? `${ev.status.replace('_', ' ')} · ${new Date(ev.created_at).toLocaleDateString()}` : 'pending'}
                  </span>
                </div>
                {!completed && (
                  <div className="btn-row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      placeholder="Note for the family (optional)"
                      value={drafts[step.key] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [step.key]: e.target.value }))}
                    />
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => recordStep(step.key, 'in_progress')}>
                      In progress
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => recordStep(step.key, 'done')}>
                      {step.key === 'completed' ? 'Mark completed' : 'Done'}
                    </button>
                    {step.key === 'personal_items' && (
                      <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => recordStep(step.key, 'skipped')}>
                        Not needed
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {completed && <p className="field-hint">This case is completed and read-only.</p>}
      </div>

      <div className="card">
        <h2>Questions from the family</h2>
        {threads.length === 0 && <p className="field-hint">No questions yet.</p>}
        {threads.map((t) => (
          <div key={t.id} style={{ padding: '0.5rem 0', borderTop: '1px solid var(--border, #e5e5e5)' }}>
            <strong>{PROMPT_LABELS[t.prompt_key] ?? t.prompt_key}</strong>
            {t.answer ? (
              <p className="field-hint">Your reply: {t.answer}</p>
            ) : (
              <div className="btn-row">
                <input
                  placeholder="Reply to the family"
                  value={answers[t.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [t.id]: e.target.value }))}
                  disabled={completed}
                />
                <button type="button" className="btn btn-primary" disabled={busy || completed} onClick={() => reply(t)}>
                  Reply
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  )
}
