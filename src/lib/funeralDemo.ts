import { demoHome, HARBORVIEW_ID } from './demoFlow'
import type { ChangeRequestKey, QuoteDisposition, ProgressStepKey, ProgressStepStatus } from './m2'

// Sample caseload for the funeral home click-through (/demo/funeral-home).
// Pure data and pure update functions, so the screen can replay or reset it. No Supabase.

export type CaseStatus = 'requested' | 'declined' | 'responded' | 'in_progress' | 'completed'

export interface QuoteLine {
  label: string
  amount: number
  optional: boolean
}

export interface StepEntry {
  status: ProgressStepStatus
  note: string | null
}

export interface FamilyQuestion {
  id: string
  key: string
  answer: string | null
}

export interface FuneralCase {
  id: string
  decedent: string
  dateOfDeath: string
  dateOfBirth: string
  ageAtDeath: number
  residence: string
  zip: string
  county: string
  contact: string
  relationship: string
  email: string
  disposition: QuoteDisposition
  changes: ChangeRequestKey[]
  requestedAt: string
  status: CaseStatus
  declineReason: string | null
  quote: { version: number; total: number; notes: string; lines: QuoteLine[] } | null
  progress: Partial<Record<Exclude<ProgressStepKey, 'hospital_care'>, StepEntry>>
  questions: FamilyQuestion[]
}

export const SAMPLE_CASES: FuneralCase[] = [
  {
    id: 'case-whitfield',
    decedent: 'Eleanor Marie Whitfield',
    dateOfDeath: '2026-10-18',
    dateOfBirth: '1941-03-02',
    ageAtDeath: 85,
    residence: '412 Pine St, Seattle, WA',
    zip: '98109',
    county: 'King',
    contact: 'Daniel Whitfield',
    relationship: 'Son',
    email: 'daniel.whitfield@example.com',
    disposition: 'cremation',
    changes: ['personal_items'],
    requestedAt: '2026-10-25T15:10:00Z',
    status: 'requested',
    declineReason: null,
    quote: null,
    progress: {},
    questions: [],
  },
  {
    id: 'case-alvarez',
    decedent: 'Robert James Alvarez',
    dateOfDeath: '2026-10-22',
    dateOfBirth: '1952-07-19',
    ageAtDeath: 74,
    residence: '18 Lakeview Ct, Bellevue, WA',
    zip: '98004',
    county: 'King',
    contact: 'Maria Alvarez',
    relationship: 'Daughter',
    email: 'maria.alvarez@example.com',
    disposition: 'burial',
    changes: ['remove_gathering'],
    requestedAt: '2026-10-25T13:42:00Z',
    status: 'requested',
    declineReason: null,
    quote: null,
    progress: {},
    questions: [],
  },
  {
    id: 'case-okafor',
    decedent: 'Mary Ann Okafor',
    dateOfDeath: '2026-10-24',
    dateOfBirth: '1960-11-30',
    ageAtDeath: 65,
    residence: '77 Cedar Ave, Renton, WA',
    zip: '98057',
    county: 'King',
    contact: 'Chidi Okafor',
    relationship: 'Spouse',
    email: 'chidi.okafor@example.com',
    disposition: 'cremation',
    changes: [],
    requestedAt: '2026-10-25T09:05:00Z',
    status: 'requested',
    declineReason: null,
    quote: null,
    progress: {},
    questions: [],
  },
  {
    id: 'case-lee',
    decedent: 'Thomas Lee',
    dateOfDeath: '2026-10-20',
    dateOfBirth: '1948-01-14',
    ageAtDeath: 78,
    residence: '903 Harbor Way, Kirkland, WA',
    zip: '98033',
    county: 'King',
    contact: 'Grace Lee',
    relationship: 'Wife',
    email: 'grace.lee@example.com',
    disposition: 'cremation',
    changes: [],
    requestedAt: '2026-10-21T10:00:00Z',
    status: 'in_progress',
    declineReason: null,
    quote: {
      version: 1,
      total: 2300,
      notes: 'Cremation package with transport and paperwork.',
      lines: [
        { label: 'Direct cremation package', amount: 2150, optional: false },
        { label: 'Transport from hospital', amount: 150, optional: false },
      ],
    },
    progress: { transfer: { status: 'done', note: 'Collected from the hospital this morning.' } },
    questions: [{ id: 'q-lee-1', key: 'fh_status', answer: null }],
  },
  {
    id: 'case-brandt',
    decedent: 'Dorothy Brandt',
    dateOfDeath: '2026-09-30',
    dateOfBirth: '1939-05-05',
    ageAtDeath: 87,
    residence: '5 Maple Ln, Redmond, WA',
    zip: '98052',
    county: 'King',
    contact: 'Peter Brandt',
    relationship: 'Son',
    email: 'peter.brandt@example.com',
    disposition: 'burial',
    changes: [],
    requestedAt: '2026-09-29T08:00:00Z',
    status: 'completed',
    declineReason: null,
    quote: {
      version: 2,
      total: 7400,
      notes: 'Burial package as listed.',
      lines: [{ label: 'Full burial service', amount: 7400, optional: false }],
    },
    progress: {
      transfer: { status: 'done', note: null },
      preparation: { status: 'done', note: null },
      service_booked: { status: 'done', note: null },
      completed: { status: 'done', note: 'Burial completed on Oct 3.' },
    },
    questions: [],
  },
]

export const CHANGE_LABEL: Record<ChangeRequestKey, string> = {
  remove_gathering: 'Remove the optional gathering',
  switch_to_cremation: 'Cremation instead of burial',
  switch_to_burial: 'Burial instead of cremation',
  add_infant_niche: 'Add an infant niche or cemetery placement',
  personal_items: 'Include personal items and clothing',
  payment_plan: 'Payment plan',
}

/** Starting price for the quote builder: the home's listed price for this disposition. */
export function listedPrice(disposition: QuoteDisposition): number {
  const home = demoHome(HARBORVIEW_ID)
  return (disposition === 'burial' ? home.price_burial : home.price_cremation) ?? 0
}

export function sumLines(lines: QuoteLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0)
}
