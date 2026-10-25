// Standalone test harness for rankCandidates against the real OpenRouter API --
// no Azure Functions runtime or Supabase needed. Run with
// `npm run test:rank-candidates` from api/.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { rankCandidates, type RankCandidateInput } from '../src/lib/rankCandidates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadRootEnv() {
  const rootEnvPath = join(__dirname, '..', '..', '.env')
  if (!existsSync(rootEnvPath)) return
  for (const line of readFileSync(rootEnvPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

loadRootEnv()

let failures = 0

function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'} - ${label}`)
  if (!condition) failures++
}

const CANDIDATES: RankCandidateInput[] = [
  { id: 'home-1', name: 'Evergreen Cremation Services', county: 'King', price_cremation: 1200, price_burial: null, rating: 4.8 },
  { id: 'home-2', name: 'Sound View Funeral Home', county: 'King', price_cremation: 1800, price_burial: 5200, rating: 4.2 },
  { id: 'home-3', name: 'Cedar Hills Memorial', county: 'Pierce', price_cremation: 950, price_burial: 4800, rating: 3.9 },
  { id: 'home-4', name: 'Lakeside Mortuary', county: 'King', price_cremation: 1600, price_burial: null, rating: null },
]

async function testRanksKnownCandidates() {
  const result = await rankCandidates('cremation', CANDIDATES)
  console.log('\n--- rankCandidates(cremation, 4 candidates) ---')
  console.log(JSON.stringify(result, null, 2))

  const knownIds = new Set(CANDIDATES.map((c) => c.id))
  check('returns 3-5 ranked items', result.length >= 3 && result.length <= 5)
  check('every pick is a real candidate id (schema-enforced)', result.every((r) => knownIds.has(r.funeral_home_id)))
  check('ranks are 1..N with no gaps or dupes', result.every((r, i) => r.rank === i + 1))
  check('every pick has a non-empty rationale', result.every((r) => r.rationale.trim().length > 0))
  check('no rationale mentions a null field (rating) for home-4', !result.find((r) => r.funeral_home_id === 'home-4')?.rationale.toLowerCase().includes('rating'))
}

async function testEmptyCandidatesShortCircuits() {
  const result = await rankCandidates('cremation', [])
  check('empty candidate list returns empty recommendations without calling the API', result.length === 0)
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set (checked process.env and repo root .env)')
    process.exit(1)
  }

  await testEmptyCandidatesShortCircuits()
  await testRanksKnownCandidates()

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
