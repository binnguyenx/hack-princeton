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

export const reportPdfUrl = (reportId: string) => `${API_BASE}/api/ai/reports/${encodeURIComponent(reportId)}.pdf`

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
