import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  CHANGE_OPTIONS,
  defaultQuoteAmount,
  formatUsd,
  isCapable,
  type ChangeRequestKey,
  type Quote,
  type QuoteDisposition,
  type QuoteRequest,
  type Selection,
} from '../lib/m2'
import type { Case, Recommendation } from '../lib/types'

const TABS: { key: QuoteDisposition; label: string }[] = [
  { key: 'burial', label: 'Burial' },
  { key: 'cremation', label: 'Cremation' },
]

function initialTab(c: Case): QuoteDisposition {
  return c.disposition_preference === 'cremation' ? 'cremation' : 'burial'
}

export function FamilyShortlist({
  caseRow,
  recs,
  onSelected,
}: {
  caseRow: Case
  recs: Recommendation[]
  onSelected: (s: Selection) => void
}) {
  const [tab, setTab] = useState<QuoteDisposition>(initialTab(caseRow))
  const [requests, setRequests] = useState<QuoteRequest[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [changingFor, setChangingFor] = useState<string | null>(null)
  const [picked, setPicked] = useState<ChangeRequestKey[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: r }, { data: q }] = await Promise.all([
      supabase.from('quote_requests').select('*').eq('case_id', caseRow.id),
      supabase.from('quotes').select('*, quote_line_items(*)').eq('case_id', caseRow.id).order('version', { ascending: false }),
    ])
    setRequests((r ?? []) as QuoteRequest[])
    setQuotes((q ?? []) as Quote[])
  }, [caseRow.id])

  useEffect(() => {
    load()
  }, [load])

  // Top choice per disposition: the highest-ranked home that offers it.
  const topFor = (d: QuoteDisposition) => recs.find((r) => isCapable(r.funeral_homes, d))?.funeral_home_id

  const openRequest = (homeId: string) =>
    requests.find((r) => r.funeral_home_id === homeId && r.disposition === tab && r.status === 'requested')

  const latestQuote = (homeId: string) =>
    quotes.find((q) => q.funeral_home_id === homeId && q.disposition === tab && q.status === 'sent')

  async function requestQuote(homeId: string, changes: ChangeRequestKey[] = []) {
    setBusyId(homeId)
    setError('')
    const { error: err } = await supabase.from('quote_requests').insert({
      case_id: caseRow.id,
      funeral_home_id: homeId,
      disposition: tab,
      change_requests: changes,
    })
    setBusyId(null)
    if (err) {
      setError(
        err.message.includes('quote_requests_one_open')
          ? 'You already have an open request with this home for this option.'
          : "We couldn't send your request. Please try again.",
      )
      return
    }
    setChangingFor(null)
    setPicked([])
    await load()
  }

  async function choose(rec: Recommendation) {
    setBusyId(rec.funeral_home_id)
    setError('')
    // Retire any previous active selection first; the unique index allows one active.
    const { error: retireErr } = await supabase
      .from('selections')
      .update({ status: 'replaced' })
      .eq('case_id', caseRow.id)
      .eq('status', 'active')
    if (retireErr) {
      setBusyId(null)
      setError("We couldn't update your choice. Please try again.")
      return
    }
    const { data, error: insertErr } = await supabase
      .from('selections')
      .insert({ case_id: caseRow.id, funeral_home_id: rec.funeral_home_id, disposition: tab })
      .select('*, funeral_homes(*)')
      .single()
    setBusyId(null)
    if (insertErr || !data) {
      setError("We couldn't save your choice. Please try again.")
      return
    }
    onSelected(data as Selection)
  }

  return (
    <>
      <div className="tab-row" role="tablist" aria-label="Quote type">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab-button${tab === t.key ? ' is-checked' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="field-hint">
        Estimates come from each home's listed prices. Final charges are confirmed when you choose a
        funeral home.
      </p>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {recs.map((rec) => {
        const home = rec.funeral_homes
        const homeId = rec.funeral_home_id
        const capable = isCapable(home, tab)
        const amount = defaultQuoteAmount(home, tab)
        const custom = latestQuote(homeId)
        const open = openRequest(homeId)
        const isTop = topFor(tab) === homeId

        return (
          <div className="home-card" key={`${tab}-${homeId}`}>
            <div className="home-card-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="home-card-rank">{rec.rank}</span>
                <h3 className="home-card-name">{home.name}</h3>
                {isTop && <span className="status-badge">Top choice</span>}
              </div>
              {home.rating != null && <span>★ {home.rating.toFixed(1)}</span>}
            </div>

            {!capable ? (
              <p className="field-hint">This home doesn't offer {tab} services.</p>
            ) : (
              <>
                <div className="home-card-meta">
                  {home.county && <span>{home.county} County</span>}
                  {home.phone && <span>{home.phone}</span>}
                </div>

                <p className="home-card-rationale">
                  {custom ? (
                    <>
                      <strong>{formatUsd(custom.total)}</strong> — quote from this home, version {custom.version}, sent{' '}
                      {new Date(custom.sent_at).toLocaleDateString()}.
                      {custom.notes ? ` ${custom.notes}` : ''}
                    </>
                  ) : amount != null ? (
                    <>
                      Estimate <strong>{formatUsd(amount)}</strong> — not yet confirmed by the funeral home.
                    </>
                  ) : (
                    'Not yet quoted'
                  )}
                </p>

                {changingFor === homeId ? (
                  <fieldset className="card card-quiet" style={{ margin: '0.5rem 0' }}>
                    <legend>What would you like changed?</legend>
                    {CHANGE_OPTIONS.map((opt) => (
                      <label key={opt.key} style={{ display: 'block' }}>
                        <input
                          type="checkbox"
                          checked={picked.includes(opt.key)}
                          onChange={() =>
                            setPicked((p) => (p.includes(opt.key) ? p.filter((k) => k !== opt.key) : [...p, opt.key]))
                          }
                        />{' '}
                        {opt.label}
                      </label>
                    ))}
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === homeId || picked.length === 0}
                        onClick={() => requestQuote(homeId, picked)}
                      >
                        Send request
                      </button>
                      <button type="button" className="btn btn-quiet" onClick={() => setChangingFor(null)}>
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <div className="btn-row">
                    {open ? (
                      <span className="status-badge">Quote requested</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyId === homeId}
                        onClick={() => requestQuote(homeId)}
                      >
                        Get quote
                      </button>
                    )}
                    {amount != null && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => {
                          setPicked([])
                          setChangingFor(homeId)
                        }}
                      >
                        Ask for changes
                      </button>
                    )}
                    <button type="button" className="btn btn-primary" disabled={busyId === homeId} onClick={() => choose(rec)}>
                      Choose this home
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
