import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { parsePdfToCaseFields } from '../lib/parsePdfToCase.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

interface ParseIntakeRequest {
  caseId: string
  storagePath: string
}

export async function parseIntake(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body = (await request.json()) as Partial<ParseIntakeRequest>

  if (!body.caseId || !body.storagePath) {
    return { status: 400, jsonBody: { error: 'caseId and storagePath are required' } }
  }

  const supabase = supabaseAdmin()

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from('intake-documents')
    .download(body.storagePath)

  if (downloadError || !pdfBlob) {
    context.error('Failed to download intake PDF', downloadError)
    return { status: 500, jsonBody: { error: 'Failed to download intake document' } }
  }

  const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer())

  let parsedFields
  try {
    parsedFields = await parsePdfToCaseFields(pdfBytes)
  } catch (err) {
    // Per spec: a parse failure (corrupted/scanned/unrelated document) still
    // creates the intake_documents row with everything blank -- it must not
    // fail the upload.
    context.error('PDF parse failed, writing all-null fields', err)
    parsedFields = null
  }

  const { error: insertError } = await supabase.from('intake_documents').insert({
    case_id: body.caseId,
    storage_path: body.storagePath,
    parsed_fields: parsedFields,
  })

  if (insertError) {
    context.error('Failed to write intake_documents row', insertError)
    return { status: 500, jsonBody: { error: 'Failed to save parsed fields' } }
  }

  return { status: 200, jsonBody: { parsedFields } }
}

// anonymous, not function: called directly from the browser via Azure Static
// Web Apps' same-origin /api/* proxy for managed Functions. A function key
// would have to be bundled into client JS to call it otherwise, which leaks
// the key. Case ids are unguessable UUIDs, same security boundary invite_tokens
// already relies on -- there's no separate authz check here beyond that.
app.http('parse-intake', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: parseIntake,
})
