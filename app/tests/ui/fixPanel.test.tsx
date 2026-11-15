/** @vitest-environment jsdom */
// Fix panel: geometry numbers, ML record, limitation and tailoring (cranial-reconstruction-candidate R13–R19).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FixPanel } from '../../src/ui/FixPanel'
import type { FixReport } from '../../src/api/client'

afterEach(() => cleanup())

const LIMITATION = 'Trained on synthetic parietotemporal defects. Other defect types and real patient scans have no measured accuracy. Not a clinical design.'

function report(over: Partial<FixReport['mlRecord']> = {}): FixReport {
  return {
    candidateId: 'c1', revisionId: 'v1',
    fix: {
      label: 'Geometry measured from a model proposal, not a clinical assessment.',
      metrics: [
        { key: 'volume', label: 'Fix volume', value: 12.3456, unit: 'mL', method: 'count × voxel volume', status: 'ok' },
        { key: 'bounding_box', label: 'Bounding box', value: [60, 48.5, 12], unit: 'mm', method: 'extent', status: 'ok' },
        { key: 'largest_rim_gap', label: 'Largest rim gap', value: null, unit: 'mm', method: 'gap',
          status: 'not-available', reason: 'Needs a defect-rim definition for model fixes; not measured yet.' },
      ],
    },
    mlRecord: {
      model: { name: 'cranial-unet-v2', architecture: 'MONAI 3D U-Net', parameters: 4800000, input: '2 mm, 128^3' },
      trainingData: 'SkullBreak parietotemporal, synthetic defects: 91 training subjects',
      heldOut: { test: { cases: 20, failures: 0, meanDice: 0.811, medianHd95Mm: 2.49, meanDice95Ci: [0.778, 0.84] },
                 validation: { cases: 23, failures: 0, meanDice: 0.835, medianHd95Mm: 2.04 }, note: 'held-out' },
      checkpointHash: 'sha256:f6b59dfb6140e6d29cc9329cbb80aa18b5aba9d3c4692a99d9da000f65923260', runId: 'run_1794725904',
      threshold: 0.5, thresholdIsDefault: true, region: null, inferenceSeconds: 41.2, totalSeconds: 95.7,
      limitation: LIMITATION, ...over,
    },
  }
}

const noop = { onThreshold: vi.fn(), onKeepRegion: vi.fn(), onFixVisibleChange: vi.fn() }

describe('FixPanel', () => {
  it('lists each number with its unit and shows unavailable numbers with the reason', () => {
    render(<FixPanel report={report()} fixVisible busy={false} {...noop} />)
    expect(screen.getByText('Fix volume').closest('tr')!.textContent).toContain('12.35 mL')
    expect(screen.getByText('Bounding box').closest('tr')!.textContent).toContain('60 × 48.5 × 12 mm')
    const gap = screen.getByText('Largest rim gap').closest('tr')!.textContent!
    expect(gap).toContain('Not available')
    expect(gap).toContain('Needs a defect-rim definition')
    expect(screen.getByText(/not a clinical assessment/i)).toBeTruthy()
  })

  it('shows how the fix was made, with the limitation always present', () => {
    render(<FixPanel report={report()} fixVisible busy={false} {...noop} />)
    const section = screen.getByRole('region', { name: 'How this was made' })
    for (const text of ['MONAI 3D U-Net', '91 training subjects', '0.811', '0.778–0.840', '2.49 mm', '20 cases',
      'run_1794725904', 'f6b59dfb', '41.2 s', LIMITATION])
      expect(section.textContent).toContain(text)
    expect(section.textContent).not.toContain('Adjusted threshold')
  })

  it('labels a non-default threshold as adjusted', () => {
    render(<FixPanel report={report({ threshold: 0.7, thresholdIsDefault: false })} fixVisible busy={false} {...noop} />)
    expect(screen.getByText('Adjusted threshold, not the evaluated setting')).toBeTruthy()
  })

  it('applies a new threshold from the slider and toggles the fix part', () => {
    const onThreshold = vi.fn(), onFixVisibleChange = vi.fn()
    render(<FixPanel report={report()} fixVisible busy={false} onThreshold={onThreshold}
      onKeepRegion={vi.fn()} onFixVisibleChange={onFixVisibleChange} />)
    fireEvent.change(screen.getByRole('slider', { name: /threshold/i }), { target: { value: '0.7' } })
    fireEvent.click(screen.getByRole('button', { name: /apply threshold/i }))
    expect(onThreshold).toHaveBeenCalledWith(0.7)
    fireEvent.click(screen.getByRole('button', { name: /hide fix/i }))
    expect(onFixVisibleChange).toHaveBeenCalledWith(false)
  })

  it('keeps only a typed IJK region', () => {
    const onKeepRegion = vi.fn()
    render(<FixPanel report={report()} fixVisible busy={false} onThreshold={vi.fn()} onKeepRegion={onKeepRegion}
      onFixVisibleChange={vi.fn()} />)
    const values = ['10', '20', '30', '40', '50', '60']
    screen.getAllByRole('spinbutton').forEach((input, n) => fireEvent.change(input, { target: { value: values[n] } }))
    fireEvent.click(screen.getByRole('button', { name: /keep region/i }))
    expect(onKeepRegion).toHaveBeenCalledWith([[10, 20, 30], [40, 50, 60]])
  })
})
