import type { ReportJob, ReportShot } from '../api/chat'
import { reportPdfUrl, uploadReportCaptures } from '../api/reports'

export type ViewShot = Extract<ReportShot, { kind: 'view' | 'annotated_view' }>
export type SliceShot = Extract<ReportShot, { kind: 'slices' }>

/** Renders shots offscreen; implementations must not change what the user sees or what is saved (R8). */
export type ShotRenderer = {
  captureView: (shot: ViewShot) => Promise<Blob>
  captureSlices: (shot: SliceShot) => Promise<Blob>
}

export type ReportProgress =
  | { phase: 'capturing'; done: number; total: number }
  | { phase: 'building' }
  | { phase: 'ready'; pages: number; pdfUrl: string }
  | { phase: 'failed'; error: string }

export type ReportResult =
  | { status: 'ready'; pages: number; pdfUrl: string }
  | { status: 'failed'; error: string }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Capture every shot of a report plan, upload them, and let the server build the PDF
 * (ai-case-report R7, R10, R15, R17). Running it again for the same job is the "Try again" path.
 */
export async function runReportJob(
  job: ReportJob,
  renderer: ShotRenderer,
  onProgress: (progress: ReportProgress) => void,
): Promise<ReportResult> {
  const fail = (error: string): ReportResult => {
    onProgress({ phase: 'failed', error })
    return { status: 'failed', error }
  }
  const captures: Record<string, Blob> = {}
  try {
    for (const [index, shot] of job.shots.entries()) {
      captures[shot.id] = shot.kind === 'slices' ? await renderer.captureSlices(shot) : await renderer.captureView(shot)
      onProgress({ phase: 'capturing', done: index + 1, total: job.shots.length })
    }
  } catch (error) {
    return fail(`Capturing the views failed: ${message(error)}`)
  }
  onProgress({ phase: 'building' })
  try {
    const report = await uploadReportCaptures(job, captures)
    if (report.status !== 'ready') return fail(`Building the PDF failed: ${report.error ?? 'unknown error'}`)
    const result = { status: 'ready' as const, pages: report.pages, pdfUrl: reportPdfUrl(job.reportId, job.conversationId) }
    onProgress({ phase: 'ready', pages: result.pages, pdfUrl: result.pdfUrl })
    return result
  } catch (error) {
    return fail(`Building the PDF failed: ${message(error)}`)
  }
}
