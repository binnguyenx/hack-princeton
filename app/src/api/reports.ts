import { API_BASE, type ReportJob } from './chat'

/** Server view of a case report (ai-case-report R13). */
export type ReportSummary = {
  report_id: string
  conversation_id: string
  status: 'needs-captures' | 'ready' | 'failed'
  title: string
  pages: number
  error: string | null
}

/** The server serves a PDF only to its own conversation (ai-case-report R14). */
export const reportPdfUrl = (reportId: string, conversationId: string) =>
  `${API_BASE}/api/ai/reports/${encodeURIComponent(reportId)}.pdf?conversation_id=${encodeURIComponent(conversationId)}`

/** Upload one PNG per shot; the server validates them and builds the PDF (R10). */
export async function uploadReportCaptures(job: ReportJob, captures: Record<string, Blob>): Promise<ReportSummary> {
  const form = new FormData()
  form.append('conversation_id', job.conversationId)
  for (const [shotId, blob] of Object.entries(captures)) form.append(shotId, blob, `${shotId}.png`)
  const response = await fetch(`${API_BASE}/api/ai/reports/${encodeURIComponent(job.reportId)}/captures`, {
    method: 'POST',
    body: form,
  })
  const body = await response.json().catch(() => null) as { report?: ReportSummary; error?: string } | null
  if (!response.ok || !body?.report) throw new Error(body?.error || `The server answered ${response.status}.`)
  return body.report
}
