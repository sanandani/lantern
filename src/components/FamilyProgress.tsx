import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FUNERAL_HOME_PROMPTS,
  HOSPITAL_PROMPTS,
  PROMPT_LABELS,
  PROGRESS_STEPS,
  latestByStep,
  stepLabel,
  type ProgressEvent,
  type PromptThread,
  type QuoteRequest,
  type Selection,
} from '../lib/m2'

export function FamilyProgress({
  selection,
  caseId,
  onChangeChoice,
}: {
  selection: Selection
  caseId: string
  onChangeChoice: () => void
}) {
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [threads, setThreads] = useState<PromptThread[]>([])
  const [personalRequested, setPersonalRequested] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: ev, error: evErr }, { data: th }, { data: req }] = await Promise.all([
      supabase.from('progress_events').select('*').eq('selection_id', selection.id),
      supabase.from('prompt_threads').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
      supabase
        .from('quote_requests')
        .select('change_requests')
        .eq('case_id', caseId)
        .eq('funeral_home_id', selection.funeral_home_id)
        .eq('disposition', selection.disposition),
    ])
    if (evErr) setError(evErr.message)
    setEvents((ev ?? []) as ProgressEvent[])
    setThreads((th ?? []) as PromptThread[])
    setPersonalRequested(((req ?? []) as Pick<QuoteRequest, 'change_requests'>[]).some((r) => r.change_requests.includes('personal_items')))
  }, [caseId, selection.id, selection.funeral_home_id, selection.disposition])

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const latest = latestByStep(events)
  const home = selection.funeral_homes?.name ?? 'your funeral home'

  async function ask(audience: 'hospital' | 'funeral_home', promptKey: string) {
    setSending(promptKey)
    setError('')
    const { error: err } = await supabase.from('prompt_threads').insert({
      case_id: caseId,
      audience,
      funeral_home_id: audience === 'funeral_home' ? selection.funeral_home_id : null,
      prompt_key: promptKey,
    })
    setSending(null)
    if (err) setError("We couldn't send your question. Please try again.")
    else await load()
  }

  return (
    <>
      <p className="eyebrow">Your arrangements</p>
      <h1>Working with {home}</h1>
      <p className="lede">
        {selection.disposition === 'burial' ? 'Burial' : 'Cremation'} selected. We'll show each step as it happens.
      </p>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <h2>Progress</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {PROGRESS_STEPS.map((step) => {
            if (step.key === 'personal_items' && !personalRequested) return null
            const isHospital = step.key === 'hospital_care'
            const ev = isHospital ? undefined : latest.get(step.key as ProgressEvent['step'])
            const status = isHospital ? 'done' : ev?.status ?? 'pending'
            return (
              <li key={step.key} className="step-row" style={{ opacity: status === 'pending' ? 0.55 : 1 }}>
                <strong>{status === 'done' ? '✓ ' : status === 'in_progress' ? '… ' : status === 'skipped' ? '– ' : '○ '}</strong>
                {stepLabel(step.key, selection.disposition)}
                {ev && <span className="field-hint"> · {new Date(ev.created_at).toLocaleDateString()}</span>}
                {ev?.note && <div className="field-hint">{ev.note}</div>}
              </li>
            )
          })}
        </ol>
      </div>

      <PromptPanel
        title="Ask the hospital"
        prompts={HOSPITAL_PROMPTS}
        threads={threads.filter((t) => t.audience === 'hospital')}
        sending={sending}
        onAsk={(key) => ask('hospital', key)}
      />
      <PromptPanel
        title={`Ask ${home}`}
        prompts={FUNERAL_HOME_PROMPTS}
        threads={threads.filter((t) => t.audience === 'funeral_home')}
        sending={sending}
        onAsk={(key) => ask('funeral_home', key)}
      />

      <div className="btn-row">
        <button type="button" className="btn btn-quiet" onClick={onChangeChoice}>
          Change my choice of funeral home
        </button>
      </div>
    </>
  )
}

function PromptPanel({
  title,
  prompts,
  threads,
  sending,
  onAsk,
}: {
  title: string
  prompts: { key: string; label: string }[]
  threads: PromptThread[]
  sending: string | null
  onAsk: (key: string) => void
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {threads.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {threads.map((t) => (
            <li key={t.id} style={{ padding: '0.4rem 0' }}>
              <div>
                <strong>{PROMPT_LABELS[t.prompt_key] ?? t.prompt_key}</strong>
              </div>
              <div className="field-hint">{t.answer ?? 'Waiting for a reply.'}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row" style={{ flexWrap: 'wrap' }}>
        {prompts.map((p) => (
          <button
            key={p.key}
            type="button"
            className="btn btn-secondary"
            disabled={sending !== null}
            onClick={() => onAsk(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
