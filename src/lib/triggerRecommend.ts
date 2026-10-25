// Fires the `recommend` Azure Function (T5.2) right after a case becomes
// `active`. Fire-and-forget: FamilyCase.tsx's WaitingForRecommendations
// already polls `cases.status`, so a slow/failed call here just leaves the
// family on the waiting screen rather than surfacing a hard error.
//
// No-op until VITE_RECOMMEND_FUNCTION_URL is set -- there's no deployed
// Azure Functions endpoint in this dev environment yet (same gap as
// parse-intake not being called from NewCase.tsx; see
// docs/milestone-1-tasks.md T1.4/T5.3). Passing a function key via a
// client-bundled VITE_ var would expose it to anyone viewing the page, so
// this intentionally only supports a key-less call -- `recommend` needs its
// authLevel reconsidered (anonymous + its own light validation, or a
// server-side-only caller) before real deployment; worth resolving as part
// of T7.2 rather than shipping a leaked function key.
export function triggerRecommend(caseId: string) {
  const url = import.meta.env.VITE_RECOMMEND_FUNCTION_URL
  if (!url) return

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  }).catch(() => {
    // Swallowed -- see fire-and-forget note above.
  })
}
