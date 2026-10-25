// Fires the `recommend` Azure Function (T5.2) right after a case becomes
// `active`. Fire-and-forget: FamilyCase.tsx's WaitingForRecommendations
// already polls `cases.status`, so a slow/failed call here just leaves the
// family on the waiting screen rather than surfacing a hard error.
//
// Calls the same-origin /api/recommend path -- Azure Static Web Apps proxies
// that to the managed Function (see api_location in the SWA workflow), no
// function key needed client-side (see recommend.ts's authLevel comment).
// In local dev (plain `vite dev`, no Functions runtime), this 404s and gets
// swallowed below -- recommendations just won't appear locally, which is
// expected until a local SWA CLI / deployed environment is used.
export function triggerRecommend(caseId: string) {
  fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  }).catch(() => {
    // Swallowed -- see fire-and-forget note above.
  })
}
