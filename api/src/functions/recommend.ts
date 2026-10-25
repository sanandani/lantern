import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { filterCandidatesForCase } from '../lib/filterCandidates.js'
import { rankCandidates } from '../lib/rankCandidates.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

interface RecommendRequest {
  caseId: string
}

export async function recommend(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body = (await request.json()) as Partial<RecommendRequest>

  if (!body.caseId) {
    return { status: 400, jsonBody: { error: 'caseId is required' } }
  }

  const supabase = supabaseAdmin()

  // Idempotent: a case activated twice (e.g. a retried request) must not
  // re-rank or duplicate rows -- if recommendations already exist, return them as-is.
  const { data: existing, error: existingError } = await supabase
    .from('recommendations')
    .select('*')
    .eq('case_id', body.caseId)
    .order('rank', { ascending: true })

  if (existingError) {
    context.error('Failed to check for existing recommendations', existingError)
    return { status: 500, jsonBody: { error: 'Failed to check for existing recommendations' } }
  }

  if (existing && existing.length > 0) {
    return { status: 200, jsonBody: { recommendations: existing } }
  }

  const { data: caseRow, error: caseError } = await supabase.from('cases').select('*').eq('id', body.caseId).single()
  if (caseError || !caseRow) {
    context.error('Failed to load case', caseError)
    return { status: 404, jsonBody: { error: 'Case not found' } }
  }

  const { data: homes, error: homesError } = await supabase.from('funeral_homes').select('*')
  if (homesError || !homes) {
    context.error('Failed to load funeral homes', homesError)
    return { status: 500, jsonBody: { error: 'Failed to load funeral homes' } }
  }

  const candidates = filterCandidatesForCase(homes, caseRow)

  let recommendations: Awaited<ReturnType<typeof rankCandidates>> = []
  if (candidates.length > 0) {
    try {
      recommendations = await rankCandidates(
        // filterCandidatesForCase only returns candidates when disposition_preference is set.
        caseRow.disposition_preference!,
        candidates.map((c) => ({
          id: c.id,
          name: c.name,
          county: c.county,
          price_cremation: c.price_cremation,
          price_burial: c.price_burial,
          rating: c.rating,
        })),
      )
    } catch (err) {
      context.error('Ranking candidates failed', err)
      return { status: 500, jsonBody: { error: 'Failed to rank candidates' } }
    }
  }

  if (recommendations.length > 0) {
    const { error: insertError } = await supabase.from('recommendations').insert(
      recommendations.map((r) => ({
        case_id: body.caseId,
        funeral_home_id: r.funeral_home_id,
        rank: r.rank,
        rationale: r.rationale,
      })),
    )

    if (insertError) {
      context.error('Failed to write recommendations', insertError)
      return { status: 500, jsonBody: { error: 'Failed to save recommendations' } }
    }
  }

  const { error: statusError } = await supabase
    .from('cases')
    .update({ status: 'recommendations_ready' })
    .eq('id', body.caseId)

  if (statusError) {
    context.error('Failed to update case status', statusError)
    return { status: 500, jsonBody: { error: 'Failed to update case status' } }
  }

  return { status: 200, jsonBody: { recommendations } }
}

app.http('recommend', {
  methods: ['POST'],
  authLevel: 'function',
  handler: recommend,
})
