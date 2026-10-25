import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { supabase } from '../lib/supabase'
import type { ProgressEvent, QuoteRequest, Selection } from '../lib/m2'
import { decedentName, type Case } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { signOut } from '../lib/auth'

type Tab = 'inbound' | 'in_progress' | 'completed'

type InboundRequest = QuoteRequest & { cases: Case }
type CaseSelection = Selection & { cases: Case }

export function FuneralHomeDashboard() {
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('inbound')
  const [requests, setRequests] = useState<InboundRequest[] | null>(null)
  const [selections, setSelections] = useState<CaseSelection[] | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: reqs, error: reqErr }, { data: sels, error: selErr }] = await Promise.all([
      supabase.from('quote_requests').select('*, cases(*)').eq('status', 'requested').order('created_at', { ascending: true }),
      supabase
        .from('selections')
        .select('*, cases(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
    ])
    if (reqErr || selErr) {
      setError((reqErr ?? selErr)!.message)
      return
    }
    const selectionRows = (sels ?? []) as CaseSelection[]
    setRequests((reqs ?? []) as InboundRequest[])
    setSelections(selectionRows)

    const ids = selectionRows.map((s) => s.id)
    if (ids.length > 0) {
      const { data: events } = await supabase
        .from('progress_events')
        .select('selection_id, step, status, created_at')
        .in('selection_id', ids)
        .eq('step', 'completed')
        .eq('status', 'done')
      setCompletedIds(new Set((events as Pick<ProgressEvent, 'selection_id'>[] | null)?.map((e) => e.selection_id) ?? []))
    } else {
      setCompletedIds(new Set())
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, session])

  const inProgress = (selections ?? []).filter((s) => !completedIds.has(s.id))
  const completed = (selections ?? []).filter((s) => completedIds.has(s.id))

  return (
    <Layout variant="funeral" wide>
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <p className="eyebrow" style={{ margin: 0 }}>Funeral home portal</p>
        <button type="button" className="btn btn-quiet" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
      <h1>Your cases</h1>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="tab-row" role="tablist">
        {(
          [
            ['inbound', `New requests (${requests?.length ?? 0})`],
            ['in_progress', `In progress (${inProgress.length})`],
            ['completed', `Completed (${completed.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab-button${tab === key ? ' is-checked' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'inbound' && (
        <>
          {requests === null && <p className="center-note">Loading…</p>}
          {requests?.length === 0 && <p className="card card-quiet">No new quote requests.</p>}
          {requests?.map((r) => (
            <div className="home-card" key={r.id}>
              <div className="home-card-top">
                <h3 className="home-card-name">{decedentName(r.cases)}</h3>
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <div className="home-card-meta">
                <span>{r.disposition === 'burial' ? 'Burial' : 'Cremation'}</span>
                {r.cases.residence_zip && <span>Zip {r.cases.residence_zip}</span>}
              </div>
              {r.change_requests.length > 0 && (
                <p className="home-card-rationale">Requested changes: {r.change_requests.join(', ').replace(/_/g, ' ')}</p>
              )}
              <div className="btn-row">
                <Link to={`/funeral-home/requests/${r.id}`} className="btn btn-primary">
                  Open request
                </Link>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'in_progress' && <CaseList rows={inProgress} emptyText="No cases in progress." />}
      {tab === 'completed' && <CaseList rows={completed} emptyText="No completed cases yet." />}
    </Layout>
  )
}

function CaseList({ rows, emptyText }: { rows: CaseSelection[]; emptyText: string }) {
  if (rows.length === 0) return <p className="card card-quiet">{emptyText}</p>
  return (
    <>
      {rows.map((s) => (
        <div className="home-card" key={s.id}>
          <div className="home-card-top">
            <h3 className="home-card-name">{decedentName(s.cases)}</h3>
            <span>{s.disposition === 'burial' ? 'Burial' : 'Cremation'}</span>
          </div>
          <div className="home-card-meta">
            {s.cases.date_of_death && <span>Died {s.cases.date_of_death}</span>}
            {s.cases.family_contact_name && <span>Family: {s.cases.family_contact_name}</span>}
          </div>
          <div className="btn-row">
            <Link to={`/funeral-home/cases/${s.case_id}`} className="btn btn-secondary">
              Open case
            </Link>
          </div>
        </div>
      ))}
    </>
  )
}
