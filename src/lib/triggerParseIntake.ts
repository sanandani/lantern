// Fires the `parse-intake` Azure Function (T1.4) right after a hospital's
// PDF upload succeeds. Fire-and-forget: CaseDetail.tsx just shows "PDF not
// parsed yet" until the intake_documents row appears, so a slow/failed call
// here doesn't block case creation.
//
// Same same-origin /api/* pattern as triggerRecommend.ts -- see that file's
// comment and recommend.ts's authLevel note for why no function key is needed.
export function triggerParseIntake(caseId: string, storagePath: string) {
  fetch('/api/parse-intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId, storagePath }),
  }).catch(() => {
    // Swallowed -- see fire-and-forget note above.
  })
}
