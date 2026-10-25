import { DEMO_RECOMMENDATIONS } from './demoData'
import type { ChangeRequestKey, ProgressEvent } from './m2'

// A scripted walk through the real app flow, from hospital upload to a completed case.
// Nothing here touches Supabase. Each step is a pure function over DemoState, so Back
// and Restart simply replay a prefix of DEMO_STEPS.

export type Pov = 'hospital' | 'family' | 'funeral'
export type Disposition = 'burial' | 'cremation'
export type DemoProgressStatus = 'in_progress' | 'done' | 'skipped'

export interface DemoRequest {
  homeId: string
  disposition: Disposition
  changes: ChangeRequestKey[]
  responded: boolean
}

export interface DemoQuote {
  homeId: string
  disposition: Disposition
  version: number
  total: number
  notes: string
}

export interface DemoPrompt {
  key: string
  audience: 'hospital' | 'funeral_home'
  answer: string | null
}

export interface DemoState {
  uploaded: boolean
  inviteSent: boolean
  confirmed: boolean
  requests: DemoRequest[]
  quotes: DemoQuote[]
  selection: { homeId: string; disposition: Disposition } | null
  progress: Partial<Record<ProgressEvent['step'], DemoProgressStatus>>
  prompts: DemoPrompt[]
}

export const INITIAL_DEMO_STATE: DemoState = {
  uploaded: false,
  inviteSent: false,
  confirmed: false,
  requests: [],
  quotes: [],
  selection: null,
  progress: {},
  prompts: [],
}

export const DEMO_INVITE_PATH = '/invite/demo-invite-token'
export const HARBORVIEW_ID = 'demo-home-2'

export function demoHome(id: string) {
  const rec = DEMO_RECOMMENDATIONS.find((r) => r.funeral_home_id === id)
  if (!rec) throw new Error(`Unknown demo funeral home ${id}`)
  return rec.funeral_homes
}

export interface DemoStep {
  pov: Pov
  title: string
  narration: string
  cta: string
  apply: (s: DemoState) => DemoState
}

export const DEMO_STEPS: DemoStep[] = [
  {
    pov: 'hospital',
    title: 'Hospital uploads the paperwork',
    narration:
      'The hospital uploads the medical certification PDF for a patient who has passed away. We read it and pre-fill the case. Low-confidence fields stay blank.',
    cta: 'Upload the sample PDF',
    apply: (s) => ({ ...s, uploaded: true }),
  },
  {
    pov: 'hospital',
    title: 'Hospital sends the family invite',
    narration:
      'The hospital checks what we read and sends the family an invite link. The link is valid for 24 hours and works once.',
    cta: 'Send the invite',
    apply: (s) => ({ ...s, inviteSent: true }),
  },
  {
    pov: 'family',
    title: 'Family opens the invite and confirms details',
    narration:
      'The family opens the link, continues without a password, and reviews what the hospital shared. They fill in anything missing, then confirm.',
    cta: 'Confirm the details',
    apply: (s) => ({ ...s, confirmed: true }),
  },
  {
    pov: 'family',
    title: 'Family sees default estimates and asks for a quote',
    narration:
      'Each shortlisted home shows an estimate from its listed prices, under Burial and Cremation. The family picks Cremation at Harborview and asks for a quote that includes personal items and clothing.',
    cta: 'Request a quote from Harborview',
    apply: (s) => ({
      ...s,
      requests: [
        ...s.requests,
        { homeId: HARBORVIEW_ID, disposition: 'cremation', changes: ['personal_items'], responded: false },
      ],
    }),
  },
  {
    pov: 'funeral',
    title: 'Funeral home sends a custom quote',
    narration:
      'Harborview opens the request, starts from its listed cremation price, and adds a line for personal items. The custom quote goes to the family as version 1.',
    cta: 'Send the custom quote',
    apply: (s) => ({
      ...s,
      requests: s.requests.map((r) => (r.homeId === HARBORVIEW_ID ? { ...r, responded: true } : r)),
      quotes: [
        ...s.quotes,
        {
          homeId: HARBORVIEW_ID,
          disposition: 'cremation',
          version: 1,
          total: 2400,
          notes: 'Cremation with a personal-items and clothing line ($250). Final charges are confirmed when you choose.',
        },
      ],
    }),
  },
  {
    pov: 'family',
    title: 'Family chooses the funeral home',
    narration:
      'The family compares the custom quote with the other estimates and chooses Harborview for cremation. The progress tracker starts.',
    cta: 'Choose Harborview for cremation',
    apply: (s) => ({ ...s, selection: { homeId: HARBORVIEW_ID, disposition: 'cremation' } }),
  },
  {
    pov: 'funeral',
    title: 'Funeral home collects the loved one',
    narration:
      'Harborview’s team collects the loved one from the hospital. The family sees the step as done.',
    cta: 'Mark transfer done',
    apply: (s) => ({ ...s, progress: { ...s.progress, transfer: 'done' } }),
  },
  {
    pov: 'funeral',
    title: 'Personal items are collected',
    narration:
      'The personal-items step shows only because the family asked for it. It is hidden otherwise, not shown as skipped.',
    cta: 'Mark personal items done',
    apply: (s) => ({ ...s, progress: { ...s.progress, personal_items: 'done' } }),
  },
  {
    pov: 'family',
    title: 'Family asks the funeral home a question',
    narration:
      'The family picks a predefined question from the list. Free-text questions are not part of this version.',
    cta: 'Ask: What is the status of my request?',
    apply: (s) => ({
      ...s,
      prompts: [...s.prompts, { key: 'fh_status', audience: 'funeral_home', answer: null }],
    }),
  },
  {
    pov: 'funeral',
    title: 'Funeral home replies and books the service',
    narration:
      'Harborview answers the question in the thread, then moves preparation and the service slot forward.',
    cta: 'Reply and book the service',
    apply: (s) => ({
      ...s,
      prompts: s.prompts.map((p) =>
        p.key === 'fh_status' ? { ...p, answer: 'Your cremation is scheduled. We will confirm the service time shortly.' } : p,
      ),
      progress: { ...s.progress, preparation: 'done', service_booked: 'done' },
    }),
  },
  {
    pov: 'funeral',
    title: 'Case completed',
    narration:
      'Once the cremation is complete, Harborview marks the case completed. It moves to the Completed list and becomes read-only.',
    cta: 'Mark completed',
    apply: (s) => ({ ...s, progress: { ...s.progress, completed: 'done' } }),
  },
]

/** Demo state after the first `index` steps have been applied. */
export function stateAt(index: number): DemoState {
  return DEMO_STEPS.slice(0, index).reduce((s, step) => step.apply(s), INITIAL_DEMO_STATE)
}
