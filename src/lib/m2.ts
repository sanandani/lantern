import type { FuneralHome } from './types'

// Milestone 2 types and catalogs. Mirrors supabase/migrations/20261025050000_m2_quotes_progress.sql
// and docs/milestone-2-spec.md.

export type QuoteDisposition = 'burial' | 'cremation'

export interface Selection {
  id: string
  case_id: string
  funeral_home_id: string
  disposition: QuoteDisposition
  status: 'active' | 'replaced'
  created_at: string
  funeral_homes?: FuneralHome
}

export interface Quote {
  id: string
  case_id: string
  funeral_home_id: string
  disposition: QuoteDisposition
  version: number
  status: 'sent' | 'superseded' | 'withdrawn'
  total: number
  notes: string | null
  sent_at: string
  quote_line_items?: QuoteLineItem[]
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  label: string
  amount: number
  optional: boolean
  category: 'service' | 'cemetery' | 'merchandise' | 'fee' | 'other'
  sort_order: number
}

export type ChangeRequestKey =
  | 'remove_gathering'
  | 'switch_to_cremation'
  | 'switch_to_burial'
  | 'add_infant_niche'
  | 'personal_items'
  | 'payment_plan'

export const CHANGE_OPTIONS: { key: ChangeRequestKey; label: string }[] = [
  { key: 'remove_gathering', label: 'Remove the optional gathering' },
  { key: 'switch_to_cremation', label: 'Cremation instead of burial' },
  { key: 'switch_to_burial', label: 'Burial instead of cremation' },
  { key: 'add_infant_niche', label: 'Add an infant niche or cemetery placement' },
  { key: 'personal_items', label: 'Include personal items and clothing' },
  { key: 'payment_plan', label: 'I need a payment plan' },
]

export interface QuoteRequest {
  id: string
  case_id: string
  funeral_home_id: string
  disposition: QuoteDisposition
  change_requests: ChangeRequestKey[]
  status: 'requested' | 'responded' | 'declined' | 'withdrawn'
  decline_reason: string | null
  created_at: string
  responded_at: string | null
}

export const PROGRESS_STEPS = [
  { key: 'hospital_care', label: 'Your loved one is in the hospital’s care' },
  { key: 'transfer', label: 'Our team has collected your loved one from the hospital' },
  { key: 'personal_items', label: 'We are collecting the clothing and personal items you asked for' },
  { key: 'preparation', label: 'Your loved one is being prepared for {disposition}' },
  { key: 'service_booked', label: 'A time for prayers and gathering has been booked' },
  { key: 'completed', label: '{Disposition} completed' },
] as const

export type ProgressStepKey = (typeof PROGRESS_STEPS)[number]['key']
export type ProgressStepStatus = 'in_progress' | 'done' | 'skipped'

export interface ProgressEvent {
  id: string
  selection_id: string
  step: Exclude<ProgressStepKey, 'hospital_care'>
  status: ProgressStepStatus
  note: string | null
  created_at: string
}

/** Wording for a progress step, filling in the disposition. */
export function stepLabel(key: ProgressStepKey, disposition: QuoteDisposition): string {
  const word = disposition === 'burial' ? 'burial' : 'cremation'
  const label = PROGRESS_STEPS.find((s) => s.key === key)?.label ?? key
  return label.replace('{disposition}', word).replace('{Disposition}', word.charAt(0).toUpperCase() + word.slice(1))
}

/**
 * Latest event per step, so a corrected step shows its newest status.
 * Steps with no event are pending.
 */
export function latestByStep(events: ProgressEvent[]): Map<ProgressEvent['step'], ProgressEvent> {
  const map = new Map<ProgressEvent['step'], ProgressEvent>()
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    map.set(e.step, e)
  }
  return map
}

// Predefined questions. Keys are stored in prompt_threads.prompt_key.
export const HOSPITAL_PROMPTS: { key: string; label: string }[] = [
  { key: 'hosp_location', label: 'Where is my loved one right now?' },
  { key: 'hosp_belongings', label: 'When can we collect belongings or paperwork?' },
  { key: 'hosp_death_cert', label: 'Who do we contact about the death certificate?' },
  { key: 'hosp_contact', label: 'Can you update my contact details?' },
]

export const FUNERAL_HOME_PROMPTS: { key: string; label: string }[] = [
  { key: 'fh_status', label: 'What is the status of my request?' },
  { key: 'fh_change_disposition', label: 'Can I change from burial to cremation?' },
  { key: 'fh_personal_items', label: 'Can I add or change clothing or personal items?' },
  { key: 'fh_gathering', label: 'Can I add a prayer or gathering time?' },
  { key: 'fh_cemetery', label: 'Can I change the cemetery or plot?' },
  { key: 'fh_total', label: 'What is the total cost so far?' },
  { key: 'fh_service_time', label: 'Can you confirm the date and time of the service?' },
  { key: 'fh_payment', label: 'I’d like payment plan or financial assistance information.' },
]

export const PROMPT_LABELS: Record<string, string> = Object.fromEntries(
  [...HOSPITAL_PROMPTS, ...FUNERAL_HOME_PROMPTS].map((p) => [p.key, p.label]),
)

export interface PromptThread {
  id: string
  case_id: string
  audience: 'hospital' | 'funeral_home'
  funeral_home_id: string | null
  prompt_key: string
  answer: string | null
  created_at: string
  answered_at: string | null
}

/**
 * Default quote for a funeral home, built from its flat dataset price.
 * Returns null when the home has no price for that disposition, which the UI
 * shows as "Not yet quoted" rather than $0.
 */
export function defaultQuoteAmount(home: FuneralHome, disposition: QuoteDisposition): number | null {
  return disposition === 'burial' ? home.price_burial : home.price_cremation
}

export function isCapable(home: FuneralHome, disposition: QuoteDisposition): boolean {
  return disposition === 'burial' ? home.burial_capable : home.cremation_capable
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
