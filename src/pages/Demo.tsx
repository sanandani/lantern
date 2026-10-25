import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { FamilyPov, FuneralPov, HospitalPov } from '../components/DemoPov'
import { DEMO_STEPS, stateAt, type Pov } from '../lib/demoFlow'

const POV_LABEL: Record<Pov, string> = {
  hospital: 'Hospital',
  family: 'Family',
  funeral: 'Funeral home',
}

const POVS: Pov[] = ['hospital', 'family', 'funeral']

// ?step=N opens the preview partway through (0 = start, DEMO_STEPS.length = finished),
// so a link can point someone at a specific moment in the flow.
function stepFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('step')
  const n = raw == null ? 0 : Number(raw)
  return Number.isInteger(n) ? Math.max(0, Math.min(DEMO_STEPS.length, n)) : 0
}

export function Demo() {
  const [index, setIndex] = useState(stepFromUrl)
  // Null means "follow the current step's POV". Set when someone peeks at another role.
  const [peek, setPeek] = useState<Pov | null>(null)

  const state = useMemo(() => stateAt(index), [index])
  const finished = index >= DEMO_STEPS.length
  const step = finished ? null : DEMO_STEPS[index]
  const activePov: Pov = peek ?? step?.pov ?? 'family'

  function go(next: number) {
    setPeek(null)
    setIndex(Math.max(0, Math.min(DEMO_STEPS.length, next)))
  }

  return (
    <Layout wide>
      <p className="eyebrow">Demo</p>
      <h1>See the whole flow</h1>
      <p className="lede">
        Walk one sample case from hospital upload to a completed cremation, from the hospital, family, and funeral home
        points of view. Each step does what the app does, using example data only. Nothing is saved or sent.
      </p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <p className="progress-label">
          {finished ? 'End of the preview' : `Step ${index + 1} of ${DEMO_STEPS.length} · ${POV_LABEL[step!.pov]}`}
        </p>
        <div className="progress-track" aria-hidden="true">
          {DEMO_STEPS.map((_, i) => (
            <div key={i} className={`progress-step${i < index ? ' is-done' : ''}`} />
          ))}
        </div>

        {finished ? (
          <>
            <h2>Case completed</h2>
            <p>
              The family chose Harborview for cremation, got a custom quote, followed each step, and asked one question.
              Use Back to revisit any step, or restart from the beginning.
            </p>
          </>
        ) : (
          <>
            <h2>{step!.title}</h2>
            <p>{step!.narration}</p>
          </>
        )}

        <div className="btn-row">
          <button type="button" className="btn btn-quiet" onClick={() => go(index - 1)} disabled={index === 0}>
            Back
          </button>
          {!finished && (
            <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
              {step!.cta}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => go(0)}>
            Restart
          </button>
        </div>
      </div>

      <div className="tab-row" role="tablist" aria-label="Point of view" style={{ marginTop: '2rem' }}>
        {POVS.map((pov) => (
          <button
            key={pov}
            type="button"
            role="tab"
            aria-selected={activePov === pov}
            className={`tab-button${activePov === pov ? ' is-checked' : ''}`}
            onClick={() => setPeek(pov)}
          >
            {POV_LABEL[pov]}
            {!finished && step!.pov === pov && peek === null ? ' · now' : ''}
          </button>
        ))}
      </div>
      <p className="field-hint">The view follows the current step. Select another tab to look at it from that side.</p>

      <div style={{ marginTop: '1rem' }}>
        {activePov === 'hospital' && <HospitalPov state={state} />}
        {activePov === 'family' && <FamilyPov state={state} />}
        {activePov === 'funeral' && <FuneralPov state={state} />}
      </div>

      <div className="btn-row" style={{ marginTop: '2rem' }}>
        <Link to="/demo/funeral-home" className="btn btn-secondary">
          Funeral home click-through
        </Link>
        <Link to="/start" className="btn btn-primary">
          Start a real case
        </Link>
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
    </Layout>
  )
}
