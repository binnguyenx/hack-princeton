import type { Candidate, Case, Sample } from '../domain/types'
import type { SampleCatalogEntry } from '../ops/importPrepared'

export type WorkspaceNavigatorProps = {
  cases: Case[]
  samples: Sample[]
  candidates: Candidate[]
  catalog: SampleCatalogEntry[]
  selectedCaseId: string | null
  onSelectCase: (caseId: string) => void
  onCreateCase: () => void
  onImportSample: (catalogId: string) => void
  onOpenSample: (sampleId: string) => void
  onCreateCandidate: (sampleId: string) => void
  onOpenCandidate: (candidateId: string) => void
}

export function WorkspaceNavigator({
  cases,
  samples,
  candidates,
  catalog,
  selectedCaseId,
  onSelectCase,
  onCreateCase,
  onImportSample,
  onOpenSample,
  onCreateCandidate,
  onOpenCandidate,
}: WorkspaceNavigatorProps) {
  const caseSamples = samples.filter((s) => s.caseId === selectedCaseId)

  return (
    <nav className="workspace-nav" aria-label="Project navigator">
      <div className="workspace-nav__section">
        <div className="workspace-nav__row">
          <h2>Cases</h2>
          <button type="button" onClick={onCreateCase}>
            New
          </button>
        </div>
        <ul className="workspace-nav__list">
          {cases.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={
                  c.id === selectedCaseId
                    ? 'workspace-nav__item is-active'
                    : 'workspace-nav__item'
                }
                onClick={() => onSelectCase(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="workspace-nav__section">
        <h2>Import sample</h2>
        <p className="workspace-nav__hint">
          Prepared volumes from data/samples (defective_skull.nrrd)
        </p>
        <select
          aria-label="Prepared sample"
          disabled={!selectedCaseId || catalog.length === 0}
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value
            if (id) {
              onImportSample(id)
              e.target.value = ''
            }
          }}
        >
          <option value="" disabled>
            Choose prepared volume…
          </option>
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="workspace-nav__section">
        <h2>Samples</h2>
        {!selectedCaseId ? (
          <p className="workspace-nav__hint">Select a case</p>
        ) : (
          <ul className="workspace-nav__list">
            {caseSamples.map((s) => (
              <li key={s.id} className="workspace-nav__block">
                <button
                  type="button"
                  className="workspace-nav__item"
                  onClick={() => onOpenSample(s.id)}
                >
                  {s.displayName ?? s.id}
                  {!s.spatiallyVerified ? ' · unverified' : ''}
                </button>
                <button
                  type="button"
                  className="workspace-nav__sub"
                  disabled={!s.spatiallyVerified}
                  onClick={() => onCreateCandidate(s.id)}
                >
                  New candidate
                </button>
                <ul>
                  {candidates
                    .filter((c) => c.sampleId === s.id)
                    .map((c) => (
                      <li key={c.objectId}>
                        <button
                          type="button"
                          className="workspace-nav__item workspace-nav__item--nested"
                          onClick={() => onOpenCandidate(c.objectId)}
                        >
                          {c.displayName ?? c.objectId}
                        </button>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  )
}
