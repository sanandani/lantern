import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { CHANGE_OPTIONS, defaultQuoteAmount, formatUsd, type QuoteLineItem, type QuoteRequest } from '../lib/m2'
import { decedentName, type Case, type FuneralHome } from '../lib/types'

type DraftLine = { label: string; amount: string; optional: boolean; category: QuoteLineItem['category'] }

const CATEGORIES: QuoteLineItem['category'][] = ['service', 'cemetery', 'merchandise', 'fee', 'other']

export function FuneralHomeRequest() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState<(QuoteRequest & { cases: Case }) | null | undefined>(undefined)
  const [home, setHome] = useState<FuneralHome | null>(null)
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [declineReason, setDeclineReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    supabase
      .from('quote_requests')
      .select('*, cases(*)')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data }) => {
        const r = data as (QuoteRequest & { cases: Case }) | null
        setRequest(r)
        if (!r) return
        const { data: h } = await supabase.from('funeral_homes').select('*').eq('id', r.funeral_home_id).single()
        const fh = h as FuneralHome | null
        setHome(fh)
        if (fh) {
          const suggested = defaultQuoteAmount(fh, r.disposition)
          if (suggested != null) setTotal(String(suggested))
        }
      })
  }, [id])

  if (request === undefined) {
    return (
      <Layout variant="funeral">
        <p className="center-note">Loading…</p>
      </Layout>
    )
  }
  if (!request) {
    return (
      <Layout variant="funeral">
        <h1>Request not found</h1>
        <Link to="/funeral-home/dashboard">Back to your cases</Link>
      </Layout>
    )
  }

  const isOpen = request.status === 'requested'
  const disposition = request.disposition === 'burial' ? 'burial' : 'cremation'

  async function sendQuote(e: React.FormEvent) {
    e.preventDefault()
    if (!request || !home) return
    const amount = Number(total)
    if (!total.trim() || Number.isNaN(amount) || amount < 0) {
      setError('Enter a total amount.')
      return
    }
    setBusy(true)
    setError('')

    const { data: prior } = await supabase
      .from('quotes')
      .select('version')
      .eq('case_id', request.case_id)
      .eq('funeral_home_id', request.funeral_home_id)
      .eq('disposition', request.disposition)
      .order('version', { ascending: false })
      .limit(1)
    const nextVersion = ((prior?.[0] as { version: number } | undefined)?.version ?? 0) + 1

    // Insert the new version first so a failed insert never leaves the family with no current quote.
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .insert({
        case_id: request.case_id,
        funeral_home_id: request.funeral_home_id,
        disposition: request.disposition,
        version: nextVersion,
        total: amount,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()
    if (quoteErr || !quote) {
      setBusy(false)
      setError("We couldn't send the quote. Please try again.")
      return
    }

    const validLines = lines.filter((l) => l.label.trim() && l.amount.trim())
    if (validLines.length > 0) {
      const { error: lineErr } = await supabase.from('quote_line_items').insert(
        validLines.map((l, i) => ({
          quote_id: quote.id,
          label: l.label.trim(),
          amount: Number(l.amount),
          optional: l.optional,
          category: l.category,
          sort_order: i,
        })),
      )
      if (lineErr) {
        setBusy(false)
        setError("The quote was saved, but its line items weren't. Please check them and try again.")
        return
      }
    }

    await supabase
      .from('quotes')
      .update({ status: 'superseded' })
      .eq('case_id', request.case_id)
      .eq('funeral_home_id', request.funeral_home_id)
      .eq('disposition', request.disposition)
      .eq('status', 'sent')
      .neq('id', quote.id)

    const { error: reqErr } = await supabase
      .from('quote_requests')
      .update({ status: 'responded', responded_at: new Date().toISOString() })
      .eq('id', request.id)
    setBusy(false)
    if (reqErr) {
      setError("The quote was sent, but we couldn't mark the request as answered.")
      return
    }
    navigate('/funeral-home/dashboard')
  }

  async function decline() {
    if (!request) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('quote_requests')
      .update({ status: 'declined', decline_reason: declineReason.trim() || null, responded_at: new Date().toISOString() })
      .eq('id', request.id)
    setBusy(false)
    if (err) setError("We couldn't decline this request. Please try again.")
    else navigate('/funeral-home/dashboard')
  }

  return (
    <Layout variant="funeral" wide>
      <p className="eyebrow">Quote request</p>
      <h1>{decedentName(request.cases)}</h1>
      <p className="lede">
        {disposition === 'burial' ? 'Burial' : 'Cremation'} · Zip {request.cases.residence_zip ?? 'not given'}
      </p>

      {!isOpen && (
        <div className="banner banner-info" role="status">
          This request is already {request.status}.
        </div>
      )}

      {request.change_requests.length > 0 && (
        <div className="card">
          <h2>Family asked for</h2>
          <ul>
            {request.change_requests.map((k) => (
              <li key={k}>{CHANGE_OPTIONS.find((o) => o.key === k)?.label ?? k}</li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && home && (
        <form onSubmit={sendQuote}>
          <div className="card">
            <h2>Your quote</h2>
            <p className="field-hint">
              {defaultQuoteAmount(home, request.disposition) != null
                ? `Pre-filled from your listed ${disposition} price (${formatUsd(defaultQuoteAmount(home, request.disposition)!)}). Edit as needed.`
                : 'No listed price for this option yet. Enter the total.'}
            </p>
            <div className="field-row">
              <label className="field">
                <span>Total (USD)</span>
                <input type="number" min={0} step="1" value={total} onChange={(e) => setTotal(e.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Note to the family (optional)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>
          </div>

          <div className="card">
            <h2>Line items (optional)</h2>
            {lines.map((l, i) => (
              <div className="field-row" key={i} style={{ alignItems: 'flex-end' }}>
                <label className="field">
                  <span>Item</span>
                  <input
                    value={l.label}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input
                    type="number"
                    min={0}
                    value={l.amount}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <select
                    value={l.category}
                    onChange={(e) =>
                      setLines(lines.map((x, j) => (j === i ? { ...x, category: e.target.value as QuoteLineItem['category'] } : x)))
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ paddingBottom: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={l.optional}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)))}
                  />{' '}
                  Optional
                </label>
                <button type="button" className="btn btn-quiet" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setLines([...lines, { label: '', amount: '', optional: false, category: 'service' }])}
            >
              Add line item
            </button>
          </div>

          {error && (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          )}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send custom quote'}
            </button>
          </div>

          <div className="card card-quiet" style={{ marginTop: '1.5rem' }}>
            <h2>Decline this request</h2>
            <label className="field">
              <span>Reason (optional)</span>
              <input value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
            </label>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={decline}>
              Decline
            </button>
          </div>
        </form>
      )}

      {!isOpen && <Link to="/funeral-home/dashboard">Back to your cases</Link>}
      {error && !isOpen && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
    </Layout>
  )
}
