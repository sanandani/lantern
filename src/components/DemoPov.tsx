import { useState } from 'react'
import { DEMO_CASE, DEMO_RECOMMENDATIONS } from '../lib/demoData'
import {
  CHANGE_OPTIONS,
  FUNERAL_HOME_PROMPTS,
  HOSPITAL_PROMPTS,
  PROGRESS_STEPS,
  PROMPT_LABELS,
  defaultQuoteAmount,
  formatUsd,
  isCapable,
  stepLabel,
  type QuoteDisposition,
} from '../lib/m2'
import { DEMO_INVITE_PATH, demoHome, HARBORVIEW_ID, type DemoState } from '../lib/demoFlow'

const DECEDENT = DEMO_CASE.decedentName

function ProgressList({ state, disposition, showPersonal }: { state: DemoState; disposition: QuoteDisposition; showPersonal: boolean }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {PROGRESS_STEPS.map((step) => {
        if (step.key === 'personal_items' && !showPersonal) return null
        const status = step.key === 'hospital_care' ? 'done' : state.progress[step.key as keyof DemoState['progress']] ?? 'pending'
        const mark = status === 'done' ? '✓' : status === 'in_progress' ? '…' : status === 'skipped' ? '–' : '○'
        return (
          <li key={step.key} className="step-row" style={{ opacity: status === 'pending' ? 0.55 : 1 }}>
            <strong>{mark}</strong> {stepLabel(step.key, disposition)}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Hospital

export function HospitalPov({ state }: { state: DemoState }) {
  const statusLabel = state.selection
    ? 'In progress with a funeral home'
    : state.confirmed
      ? 'Recommendations ready'
      : state.inviteSent
        ? 'Waiting for family to confirm'
        : state.uploaded
          ? 'Pending review'
          : 'No case yet'

  return (
    <>
      <div className="card">
        <h2>Case: {DECEDENT}</h2>
        <p>
          <span className="status-badge">{statusLabel}</span>
        </p>
        {!state.uploaded && <p className="field-hint">No documents uploaded yet.</p>}
        {state.uploaded && (
          <>
            <p className="field-hint">Uploaded: hospital-medical-cert-wa.pdf</p>
            <dl className="demo-summary">
              <dt>Decedent</dt>
              <dd>{DECEDENT}</dd>
              <dt>Date of death</dt>
              <dd>{DEMO_CASE.dateOfDeath}</dd>
              <dt>Residence</dt>
              <dd>
                Zip {DEMO_CASE.residenceZip} ({DEMO_CASE.residenceCounty} County)
              </dd>
              <dt>Family contact</dt>
              <dd>
                {DEMO_CASE.contactName} ({DEMO_CASE.contactRelationship})
              </dd>
            </dl>
            <p className="field-hint">
              Cause of death is read from the PDF but never stored or shown. Fields we are unsure of are left blank for review.
            </p>
          </>
        )}
      </div>

      {state.inviteSent && (
        <div className="card">
          <h2>Family invite</h2>
          <p>Sent to the family contact. Valid for 24 hours, single use.</p>
          <code>{DEMO_INVITE_PATH}</code>
        </div>
      )}

      {state.selection && (
        <div className="card">
          <h2>Progress (read-only)</h2>
          <ProgressList state={state} disposition="cremation" showPersonal={state.requests.some((r) => r.changes.includes('personal_items'))} />
          <h3 style={{ marginTop: '1rem' }}>Questions the hospital can answer</h3>
          <p className="field-hint">{HOSPITAL_PROMPTS.map((p) => p.label).join(' · ')}</p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Family

export function FamilyPov({ state }: { state: DemoState }) {
  const [tab, setTab] = useState<QuoteDisposition>('burial')

  if (!state.confirmed) {
    return (
      <div className="card">
        <p className="eyebrow">Confirm the details</p>
        <h2>Here’s what we have for {DECEDENT}</h2>
        <p className="field-hint">The hospital shared these details. Anything missing or wrong can be fixed here.</p>
        <dl className="demo-summary">
          <dt>Loved one</dt>
          <dd>{DECEDENT}</dd>
          <dt>Date of death</dt>
          <dd>{DEMO_CASE.dateOfDeath}</dd>
          <dt>Residence</dt>
          <dd>
            Zip {DEMO_CASE.residenceZip} ({DEMO_CASE.residenceCounty} County)
          </dd>
        </dl>
        {!state.inviteSent && <p className="banner banner-info">Waiting for the hospital to send the invite.</p>}
      </div>
    )
  }

  if (state.selection) {
    const home = demoHome(state.selection.homeId)
    const personal = state.requests.some((r) => r.homeId === state.selection!.homeId && r.changes.includes('personal_items'))
    return (
      <>
        <p className="eyebrow">Your arrangements</p>
        <h2>Working with {home.name}</h2>
        <p className="field-hint">{state.selection.disposition === 'burial' ? 'Burial' : 'Cremation'} selected.</p>
        <div className="card">
          <h3>Progress</h3>
          <ProgressList state={state} disposition={state.selection.disposition} showPersonal={personal} />
        </div>
        <div className="card">
          <h3>Ask the funeral home</h3>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {FUNERAL_HOME_PROMPTS.slice(0, 4).map((p) => (
              <li key={p.key}>{p.label}</li>
            ))}
          </ul>
          {state.prompts.map((p) => (
            <div key={p.key} style={{ padding: '0.5rem 0' }}>
              <strong>{PROMPT_LABELS[p.key]}</strong>
              <div className="field-hint">{p.answer ?? 'Waiting for a reply.'}</div>
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <p className="eyebrow">Your recommendations</p>
      <h2>Funeral homes for {DECEDENT}</h2>
      <div className="tab-row" role="tablist">
        {(['burial', 'cremation'] as QuoteDisposition[]).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={tab === d}
            className={`tab-button${tab === d ? ' is-checked' : ''}`}
            onClick={() => setTab(d)}
          >
            {d === 'burial' ? 'Burial' : 'Cremation'}
          </button>
        ))}
      </div>
      {DEMO_RECOMMENDATIONS.map((rec) => {
        const home = rec.funeral_homes
        const capable = isCapable(home, tab)
        const amount = defaultQuoteAmount(home, tab)
        const request = state.requests.find((r) => r.homeId === home.id && r.disposition === tab)
        const quote = state.quotes.find((q) => q.homeId === home.id && q.disposition === tab)
        return (
          <div className="home-card" key={`${tab}-${home.id}`}>
            <div className="home-card-top">
              <h3 className="home-card-name">
                {rec.rank}. {home.name}
              </h3>
              {home.rating != null && <span>★ {home.rating.toFixed(1)}</span>}
            </div>
            {!capable ? (
              <p className="field-hint">This home doesn’t offer {tab} services.</p>
            ) : (
              <p className="home-card-rationale">
                {quote ? (
                  <>
                    <strong>{formatUsd(quote.total)}</strong> — quote from this home, version {quote.version}. {quote.notes}
                  </>
                ) : amount != null ? (
                  <>
                    Estimate <strong>{formatUsd(amount)}</strong> — not yet confirmed by the funeral home.
                  </>
                ) : (
                  'Not yet quoted'
                )}
              </p>
            )}
            {request && !quote && <span className="status-badge">Quote requested</span>}
            {request && (
              <p className="field-hint">
                Requested: {request.changes.map((k) => CHANGE_OPTIONS.find((o) => o.key === k)?.label ?? k).join(', ')}
              </p>
            )}
          </div>
        )
      })}
      <p className="field-hint">Harborview’s quote is on the Cremation tab. Choose a home after comparing.</p>
      {state.requests.length > 0 && !state.selection && (
        <div className="banner banner-info">You can choose {demoHome(HARBORVIEW_ID).name} once its quote arrives.</div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Funeral home

export function FuneralPov({ state }: { state: DemoState }) {
  const home = demoHome(HARBORVIEW_ID)
  const request = state.requests.find((r) => r.homeId === HARBORVIEW_ID)
  const quote = state.quotes.find((q) => q.homeId === HARBORVIEW_ID)
  const completed = state.progress.completed === 'done'

  if (!request) {
    return (
      <div className="card">
        <h2>{home.name}</h2>
        <p className="card card-quiet">No new quote requests.</p>
      </div>
    )
  }

  if (!state.selection) {
    return (
      <div className="card">
        <h2>New request · {DECEDENT}</h2>
        <p className="field-hint">
          Cremation · Zip {DEMO_CASE.residenceZip}
          {request.changes.length > 0 &&
            ` · Asked for: ${request.changes.map((k) => CHANGE_OPTIONS.find((o) => o.key === k)?.label ?? k).join(', ')}`}
        </p>
        {!request.responded ? (
          <>
            <p>Quote pre-filled from the listed cremation price of {formatUsd(home.price_cremation ?? 0)}. Edit as needed.</p>
            <p className="banner banner-info">Next step: send the custom quote.</p>
          </>
        ) : (
          <p>
            Quote sent: <strong>{formatUsd(quote!.total)}</strong>, version {quote!.version}. Waiting for the family to choose.
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <h2>{DECEDENT}</h2>
        <p className="field-hint">
          Cremation · {completed ? 'Completed (read-only)' : 'In progress'} · Accepted quote {formatUsd(quote!.total)}
        </p>
        <dl className="demo-summary">
          <dt>Date of death</dt>
          <dd>{DEMO_CASE.dateOfDeath}</dd>
          <dt>Family contact</dt>
          <dd>
            {DEMO_CASE.contactName} ({DEMO_CASE.contactRelationship})
          </dd>
        </dl>
      </div>
      <div className="card">
        <h3>Progress</h3>
        <ProgressList state={state} disposition="cremation" showPersonal={request.changes.includes('personal_items')} />
      </div>
      <div className="card">
        <h3>Questions from the family</h3>
        {state.prompts.filter((p) => p.audience === 'funeral_home').length === 0 && (
          <p className="field-hint">No questions yet.</p>
        )}
        {state.prompts
          .filter((p) => p.audience === 'funeral_home')
          .map((p) => (
            <div key={p.key} style={{ padding: '0.5rem 0' }}>
              <strong>{PROMPT_LABELS[p.key]}</strong>
              <div className="field-hint">{p.answer ? `Your reply: ${p.answer}` : 'Waiting for your reply.'}</div>
            </div>
          ))}
      </div>
    </>
  )
}
