// Standalone test harness for parsePdfToCaseFields against the real
// OpenRouter API and the checked-in fixture PDFs -- no Azure Functions
// runtime or Supabase needed. Run with `npm run test:parse-intake` from api/.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parsePdfToCaseFields, type ParsedCaseFields } from '../src/lib/parsePdfToCase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// api/ has no .env of its own -- borrow OPENROUTER_API_KEY from the repo root's,
// same as the Vite app does for VITE_*, without adding a dotenv dependency.
function loadRootEnv() {
  const rootEnvPath = join(__dirname, '..', '..', '.env')
  if (!existsSync(rootEnvPath)) return
  for (const line of readFileSync(rootEnvPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

loadRootEnv()

const FIXTURES = join(__dirname, '..', '..', 'fixtures', 'sample-pdfs')

let failures = 0

function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'} - ${label}`)
  if (!condition) failures++
}

function allNull(fields: ParsedCaseFields) {
  return Object.values(fields).every((f) => f.value === null)
}

async function testCleanCert() {
  const pdfBytes = readFileSync(join(FIXTURES, '01-hospital-medical-cert-wa.pdf'))
  const fields = await parsePdfToCaseFields(pdfBytes)
  console.log('\n--- 01-hospital-medical-cert-wa.pdf ---')
  console.log(JSON.stringify(fields, null, 2))

  check('legal_first_name extracted', fields.legal_first_name.value !== null)
  check('legal_last_name extracted', fields.legal_last_name.value !== null)
  check('date_of_death extracted', fields.date_of_death.value !== null)
  check('no forbidden keys in output (schema-enforced)', !('cause_of_death' in fields) && !('manner_of_death' in fields) && !('ssn' in fields))
}

async function testNonDeathDoc() {
  const pdfBytes = readFileSync(join(FIXTURES, '03-non-death-lab-report.pdf'))
  const fields = await parsePdfToCaseFields(pdfBytes)
  console.log('\n--- 03-non-death-lab-report.pdf ---')
  console.log(JSON.stringify(fields, null, 2))

  check('unrelated document returns all-null fields (no error thrown)', allNull(fields))
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set (checked process.env and repo root .env)')
    process.exit(1)
  }

  await testCleanCert()
  await testNonDeathDoc()

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
