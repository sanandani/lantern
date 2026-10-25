import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { RecommendationCard } from '../components/RecommendationCard'
import { DEMO_CASE, DEMO_RECOMMENDATIONS } from '../lib/demoData'

const DISPOSITION_LABEL = { burial: 'Burial', cremation: 'Cremation', unsure: "Not sure yet" }

const STEPS = [
  'A hospital uploads the intake paperwork, and we pre-fill what we can.',
  'The family confirms the details on a short review screen.',
  'The family answers six quick questions about their loved one and their needs.',
  'We match them with funeral homes nearby and explain why each one fits.',
]

export function Demo() {
  return (
    <Layout wide>
      <p className="eyebrow">Demo</p>
      <h1>See how AgenticLantern works</h1>
      <p className="lede">
        This walkthrough uses a sample family and sample funeral homes. No email, sign-in, or typing
        needed.
      </p>

      <div className="banner banner-info" role="status">
        Everything on this page is example data. Nothing is saved or sent to anyone.
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>How it works</h2>
        <ol>
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h2>Sample family's answers</h2>
        <dl className="demo-summary">
          <dt>Loved one</dt>
          <dd>{DEMO_CASE.decedentName}</dd>
          <dt>Date of death</dt>
          <dd>{DEMO_CASE.dateOfDeath}</dd>
          <dt>Home zip code</dt>
          <dd>
            {DEMO_CASE.residenceZip} ({DEMO_CASE.residenceCounty} County)
          </dd>
          <dt>Burial or cremation</dt>
          <dd>{DISPOSITION_LABEL[DEMO_CASE.disposition]}</dd>
          <dt>Contact</dt>
          <dd>
            {DEMO_CASE.contactName} ({DEMO_CASE.contactRelationship})
          </dd>
        </dl>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Recommended funeral homes</h2>
      <p className="lede">Ranked for this family based on location, services, and rating.</p>
      {DEMO_RECOMMENDATIONS.map((r) => (
        <RecommendationCard key={r.id} rec={r} />
      ))}

      <div className="btn-row">
        <Link to="/start" className="btn btn-primary">
          Find a funeral home for my family
        </Link>
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
    </Layout>
  )
}
