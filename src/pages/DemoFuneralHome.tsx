import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { PROGRESS_STEPS, PROMPT_LABELS, formatUsd, stepLabel, type ProgressStepKey } from '../lib/m2'
import {
  CHANGE_LABEL,
  SAMPLE_CASES,
  listedPrice,
  sumLines,
  type CaseStatus,
  type FuneralCase,
  type QuoteLine,
} from '../lib/funeralDemo'
import { demoHome, HARBORVIEW_ID } from '../lib/demoFlow'

type Tab = 'new' | 'active' | 'done'

const TAB_STATUSES: Record<Tab, CaseStatus[]> = {
  new: ['requested', 'declined', 'responded'],
  active: ['in_progress'],
  done: ['completed'],
}

const TAB_LABEL: Record<Tab, string> = { new: 'New requests', active: 'In progress', done: 'Completed' }

const STATUS_TEXT: Record<CaseStatus, string> = {
  requested: 'New request',
  declined: 'Declined',
  responded: 'Quote sent, waiting for family',
  in_progress: 'In progress',
  completed: 'Completed',
}

const HINT: Record<Tab, string> = {
  new: 'Open a new request, send a custom quote, then simulate the family choosing Harborview.',
  active: 'Update each step as the work happens. The family sees every change.',
  done: 'Completed cases are read-only.',
}

export function DemoFuneralHome() {
  const [cases, setCases] = useState<FuneralCase[]>(SAMPLE_CASES)
  const [tab, setTab] = useState<Tab>('new')
  const [openId, setOpenId] = useState<string | null>(null)

  const counts = (t: Tab) => cases.filter((c) => TAB_STATUSES[t].includes(c.status)).length
  const open = cases.find((c) => c.id === openId) ?? null

  function patch(id: string, fn: (c: FuneralCase) => FuneralCase) {
    setCases((list) => list.map((c) => (c.id === id ? fn(c) : c)))
  }

  function reset() {
    setCases(SAMPLE_CASES)
    setOpenId(null)
    setTab('new')
  }

  function openCase(c: FuneralCase) {
    setOpenId(c.id)
    setTab(TAB_STATUSES.new.includes(c.status) ? 'new' : TAB_STATUSES.active.includes(c.status) ? 'active' : 'done')
  }

  return (
    <Layout variant="funeral" wide>
      <p className="eyebrow">Funeral home click-through</p>
      <h1>{demoHome(HARBORVIEW_ID).name}</h1>
      <p className="lede">
        Sample caseload for a funeral home. Respond to requests, send custom quotes, update progress, and answer questions.
        Nothing is saved or sent.
      </p>

      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <div className="tab-row" role="tablist" style={{ margin: 0 }}>
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t && !open}
              className={`tab-button${tab === t && !open ? ' is-checked' : ''}`}
              onClick={() => {
                setTab(t)
                setOpenId(null)
              }}
            >
              {TAB_LABEL[t]} ({counts(t)})
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-quiet" onClick={reset}>
          Reset sample data
        </button>
      </div>

      {!open && <p className="field-hint">{HINT[tab]}</p>}

      {open ? (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => setOpenId(null)}>
            ← Back to {TAB_LABEL[tab].toLowerCase()}
          </button>
          {open.status === 'requested' || open.status === 'declined' || open.status === 'responded' ? (
            <RequestView
              key={open.id}
              c={open}
              onSend={(lines, total, notes) =>
                patch(open.id, (c) => ({
                  ...c,
                  status: 'responded',
                  quote: { version: (c.quote?.version ?? 0) + 1, total, notes, lines },
                }))
              }
              onDecline={(reason) => {
                patch(open.id, (c) => ({ ...c, status: 'declined', declineReason: reason }))
                setOpenId(null)
              }}
              onFamilyChooses={() => {
                patch(open.id, (c) => ({ ...c, status: 'in_progress' }))
                setTab('active')
                setOpenId(null)
              }}
            />
          ) : (
            <CaseView
              key={open.id}
              c={open}
              onStep={(step, status, note) =>
                patch(open.id, (c) => ({
                  ...c,
                  progress: { ...c.progress, [step]: { status, note } },
                  status: step === 'completed' && status === 'done' ? 'completed' : c.status,
                }))
              }
              onReply={(qid, text) =>
                patch(open.id, (c) => ({
                  ...c,
                  questions: c.questions.map((q) => (q.id === qid ? { ...q, answer: text } : q)),
                }))
              }
            />
          )}
        </>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          {cases.filter((c) => TAB_STATUSES[tab].includes(c.status)).length === 0 && (
            <p className="card card-quiet">Nothing here right now.</p>
          )}
          {cases
            .filter((c) => TAB_STATUSES[tab].includes(c.status))
            .map((c) => (
              <div className="home-card" key={c.id}>
                <div className="home-card-top">
                  <h3 className="home-card-name">{c.decedent}</h3>
                  <span className="status-badge">{STATUS_TEXT[c.status]}</span>
                </div>
                <div className="home-card-meta">
                  <span>{c.disposition === 'burial' ? 'Burial' : 'Cremation'}</span>
                  <span>Zip {c.zip}</span>
                  <span>Requested {new Date(c.requestedAt).toLocaleDateString()}</span>
                  {c.quote && <span>Quote v{c.quote.version}: {formatUsd(c.quote.total)}</span>}
                </div>
                {c.changes.length > 0 && (
                  <p className="home-card-rationale">Asked for: {c.changes.map((k) => CHANGE_LABEL[k]).join(', ')}</p>
                )}
                <div className="btn-row">
                  <button type="button" className="btn btn-primary" onClick={() => openCase(c)}>
                    Open
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: '2rem' }}>
        <Link to="/demo" className="btn btn-secondary">
          Back to the family demo
        </Link>
      </div>
    </Layout>
  )
}

// ---------------------------------------------------------------------------

function DetailsCard({ c }: { c: FuneralCase }) {
  return (
    <div className="card">
      <h2>{c.decedent}</h2>
      <p className="field-hint">
        {c.disposition === 'burial' ? 'Burial' : 'Cremation'} · {STATUS_TEXT[c.status]}
      </p>
      <dl className="demo-summary">
        <dt>Date of death</dt>
        <dd>{c.dateOfDeath}</dd>
        <dt>Date of birth</dt>
        <dd>{c.dateOfBirth}</dd>
        <dt>Age at death</dt>
        <dd>{c.ageAtDeath}</dd>
        <dt>Residence</dt>
        <dd>
          {c.residence} ({c.county} County)
        </dd>
        <dt>Family contact</dt>
        <dd>
          {c.contact} ({c.relationship}) · {c.email}
        </dd>
      </dl>
    </div>
  )
}

function RequestView({
  c,
  onSend,
  onDecline,
  onFamilyChooses,
}: {
  c: FuneralCase
  onSend: (lines: QuoteLine[], total: number, notes: string) => void
  onDecline: (reason: string) => void
  onFamilyChooses: () => void
}) {
  const base = c.quote?.lines ?? [{ label: `${c.disposition === 'burial' ? 'Burial' : 'Cremation'} package`, amount: listedPrice(c.disposition), optional: false }]
  const [lines, setLines] = useState<QuoteLine[]>(base)
  const [notes, setNotes] = useState(c.quote?.notes ?? '')
  const [reason, setReason] = useState('')
  const total = sumLines(lines)
  const editable = c.status === 'requested'
  const revising = c.status === 'responded'

  return (
    <>
      <DetailsCard c={c} />

      {c.changes.length > 0 && (
        <div className="card">
          <h2>Family asked for</h2>
          <ul>
            {c.changes.map((k) => (
              <li key={k}>{CHANGE_LABEL[k]}</li>
            ))}
          </ul>
        </div>
      )}

      {c.status === 'declined' && (
        <div className="banner banner-info" role="status">
          Declined{c.declineReason ? `: ${c.declineReason}` : '.'}
        </div>
      )}

      {c.status !== 'declined' && (
        <div className="card">
          <h2>{revising ? `Quote v${c.quote!.version} sent · revise` : 'Your custom quote'}</h2>
          <p className="field-hint">
            Starts from the listed {c.disposition === 'burial' ? 'burial' : 'cremation'} price. Add or remove lines, then send.
          </p>
          {lines.map((line, i) => (
            <div className="field-row" key={i} style={{ alignItems: 'flex-end' }}>
              <label className="field">
                <span>Item</span>
                <input
                  value={line.label}
                  disabled={!editable && !revising}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                />
              </label>
              <label className="field">
                <span>Amount (USD)</span>
                <input
                  type="number"
                  min={0}
                  value={line.amount}
                  disabled={!editable && !revising}
                  onChange={(e) =>
                    setLines(lines.map((l, j) => (j === i ? { ...l, amount: Number(e.target.value) || 0 } : l)))
                  }
                />
              </label>
              <label style={{ paddingBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={line.optional}
                  disabled={!editable && !revising}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, optional: e.target.checked } : l)))}
                />{' '}
                Optional
              </label>
              {(editable || revising) && (
                <button type="button" className="btn btn-quiet" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {(editable || revising) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setLines([...lines, { label: 'Additional item', amount: 0, optional: false }])}
            >
              Add line
            </button>
          )}
          <p>
            <strong>Total: {formatUsd(total)}</strong>
          </p>
          {(editable || revising) && (
            <>
              <label className="field">
                <span>Note to the family (optional)</span>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={lines.length === 0 || total <= 0}
                  onClick={() => onSend(lines, total, notes)}
                >
                  {revising ? `Send revised quote (v${c.quote!.version + 1})` : 'Send custom quote'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {revising && (
        <div className="card">
          <h2>Family response</h2>
          <p className="field-hint">The family compares quotes and chooses a home. Simulate that choice here.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onFamilyChooses}>
              Simulate: family chooses Harborview
            </button>
          </div>
        </div>
      )}

      {editable && (
        <div className="card card-quiet">
          <h2>Decline this request</h2>
          <label className="field">
            <span>Reason (optional)</span>
            <input placeholder="Reason for declining (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="btn btn-quiet" onClick={() => onDecline(reason.trim())}>
            Decline
          </button>
        </div>
      )}
    </>
  )
}

type TrackedStep = Exclude<ProgressStepKey, 'hospital_care'>

function StepRow({
  c,
  step,
  onStep,
}: {
  c: FuneralCase
  step: TrackedStep
  onStep: (step: TrackedStep, status: 'in_progress' | 'done' | 'skipped', note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const key = step
  const entry = c.progress[key]
  const done = c.status === 'completed'

  return (
    <li className="step-row">
      <div>
        <strong>{stepLabel(step, c.disposition)}</strong>{' '}
        <span className="field-hint">{entry ? `· ${entry.status.replace('_', ' ')}${entry.note ? ` — ${entry.note}` : ''}` : '· pending'}</span>
      </div>
      {!done && (
        <div className="btn-row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Note for the family (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={() => onStep(key, 'in_progress', note.trim() || null)}>
            In progress
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onStep(key, 'done', note.trim() || null)}>
            {key === 'completed' ? 'Mark completed' : 'Done'}
          </button>
          {key === 'personal_items' && (
            <button type="button" className="btn btn-quiet" onClick={() => onStep(key, 'skipped', null)}>
              Not needed
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function CaseView({
  c,
  onStep,
  onReply,
}: {
  c: FuneralCase
  onStep: (step: TrackedStep, status: 'in_progress' | 'done' | 'skipped', note: string | null) => void
  onReply: (questionId: string, text: string) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const done = c.status === 'completed'
  const showPersonal = c.changes.includes('personal_items')

  return (
    <>
      <DetailsCard c={c} />

      {c.quote && (
        <div className="card">
          <h2>Accepted quote · v{c.quote.version}</h2>
          <p>
            <strong>{formatUsd(c.quote.total)}</strong> — {c.quote.notes}
          </p>
        </div>
      )}

      <div className="card">
        <h2>Progress</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {PROGRESS_STEPS.filter((s): s is typeof s & { key: TrackedStep } => s.key !== 'hospital_care')
            .filter((s) => s.key !== 'personal_items' || showPersonal)
            .map((s) => (
              <StepRow key={s.key} c={c} step={s.key} onStep={onStep} />
            ))}
        </ol>
        {done && <p className="field-hint">This case is completed and read-only.</p>}
      </div>

      <div className="card">
        <h2>Questions from the family</h2>
        {c.questions.length === 0 && <p className="field-hint">No questions yet.</p>}
        {c.questions.map((q) => (
          <div key={q.id} style={{ padding: '0.5rem 0' }}>
            <strong>{PROMPT_LABELS[q.key] ?? q.key}</strong>
            {q.answer ? (
              <p className="field-hint">Your reply: {q.answer}</p>
            ) : (
              <div className="btn-row">
                <input
                  placeholder="Reply to the family"
                  value={answers[q.id] ?? ''}
                  disabled={done}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={done || !answers[q.id]?.trim()}
                  onClick={() => onReply(q.id, answers[q.id].trim())}
                >
                  Reply
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
