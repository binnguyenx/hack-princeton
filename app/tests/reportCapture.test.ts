import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportJob } from '../src/api/chat'
import { runReportJob, type ReportProgress } from '../src/report/captureShots'

afterEach(() => vi.unstubAllGlobals())

const job: ReportJob = {
  reportId: 'rep-1',
  conversationId: 'conv-1',
  title: 'Defect review',
  shots: [
    { id: 'shot-01', kind: 'view', section: 'hero', preset: 'hero_oblique', objects: ['src'], title: '' },
    { id: 'shot-02', kind: 'annotated_view', section: 'annotated', preset: 'left', objects: ['src'], title: '',
      callouts: [{ annotation_id: 'ann-1', label: 'Defect rim' }] },
    { id: 'shot-03', kind: 'slices', section: 'slices', centre: 'defect', title: '' },
  ],
}

const png = (tag: string) => new Blob([tag], { type: 'image/png' })

function okUpload() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    report: { report_id: 'rep-1', conversation_id: 'conv-1', status: 'ready', title: 'Defect review', pages: 6, error: null },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('runReportJob (ai-case-report R7, R10, R15, R17)', () => {
  it('captures every shot in order, reports progress, uploads once and ends ready', async () => {
    const fetchMock = okUpload()
    const captureView = vi.fn(async (shot: { id: string }) => png(shot.id))
    const captureSlices = vi.fn(async (shot: { id: string }) => png(shot.id))
    const progress: ReportProgress[] = []
    const result = await runReportJob(job, { captureView, captureSlices }, p => progress.push(p))

    expect(captureView.mock.calls.map(c => c[0].id)).toEqual(['shot-01', 'shot-02'])
    expect(captureSlices.mock.calls.map(c => c[0].id)).toEqual(['shot-03'])
    expect(progress.map(p => p.phase)).toEqual(['capturing', 'capturing', 'capturing', 'building', 'ready'])
    expect(progress.slice(0, 3).map(p => p.phase === 'capturing' && `${p.done}/${p.total}`)).toEqual(['1/3', '2/3', '3/3'])
    expect(result).toEqual({ status: 'ready', pages: 6, pdfUrl: '/api/ai/reports/rep-1.pdf' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/reports/rep-1/captures')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('conversation_id')).toBe('conv-1')
    expect([...form.keys()].filter(k => k.startsWith('shot-')).sort()).toEqual(['shot-01', 'shot-02', 'shot-03'])
  })

  it('a failed capture fails the job without uploading', async () => {
    const fetchMock = okUpload()
    const progress: ReportProgress[] = []
    const result = await runReportJob(job, {
      captureView: async () => { throw new Error('WebGL context lost') },
      captureSlices: async () => png('s'),
    }, p => progress.push(p))
    expect(result).toEqual({ status: 'failed', error: 'Capturing the views failed: WebGL context lost' })
    expect(progress.at(-1)).toEqual({ phase: 'failed', error: 'Capturing the views failed: WebGL context lost' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a rejected upload or build fails with the server reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Capture shot-01 is not a PNG.', code: 'not-png' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } })))
    const result = await runReportJob(job, { captureView: async () => png('v'), captureSlices: async () => png('s') }, () => {})
    expect(result).toEqual({ status: 'failed', error: 'Building the PDF failed: Capture shot-01 is not a PNG.' })
  })
})
