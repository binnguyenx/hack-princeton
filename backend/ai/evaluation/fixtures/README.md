# Demo fixtures

These deterministic fixtures support the acceptance scenarios in [../README.md](../README.md). They are test inputs and expected observations, not evidence that the application implements the feature.

## Files

- `demo-state.json`: two prepared synthetic cases, source-anatomy revisions, temporary selections, one persisted region, one candidate with two immutable mock revisions, artifact records, and one nonnumeric measurement-history sentinel.
- `requests.json`: AI and direct mechanical request samples for mock generation, cross-case selection, stale revision, idempotent retry, request-id conflict, unsupported contour guidance, and an unavailable real measurement.
- `expected-results.json`: representative common result envelopes for successful mock generation and an unavailable real measurement.
- `artifacts/`: tiny synthetic tetrahedron JSON assets. They contain no patient data and are not benchmark ground truth.

## Loading and artifact resolution

Load JSON with the standard library. Resolve each artifact `path` relative to:

```
backend/ai/evaluation/fixtures/<artifact_base_directory>/
```

For `demo-state.json`, `artifact_base_directory` is `artifacts`. No absolute or server-local path is part of a frontend contract. Public result artifacts use `retrieval_url`; fixture manifests use a separate relative `path` only to make validation self-contained. `retrieval_reference` is not a supported public alias.

## Coordinates, units, and transforms

All coordinates are synthetic and `unitless`. `fixture-primary-local` and `fixture-secondary-local` are fixture-only coordinate-frame names. Identity matrices make frame preservation explicit without proposing physical units, clinical axes, or a real geometry standard.

Selections and persisted regions identify the immutable geometry revision and coordinate frame they refer to. Expected canonical commands preserve that complete selection object rather than reducing it to `selection_id`. A consumer must not move a reference to a different revision silently.

## Provenance and limitations

Source assets use `test-double` provenance. Candidate artifacts use `mock` provenance and explicitly state that they are not real reconstructions and make no anatomical, measurement, or geometric-quality claim.

The review-result sentinel tests revision association only. It has no numeric value and is not a real measurement.

## Validation

From the repository root:

```
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B backend/ai/tests/integration/workflows/test_demo_fixtures.py
```

The validation deserializes production-shaped requests, commands, selections, spatial metadata, artifacts, and result envelopes through `skullfix_ai.schemas`. Separate fixture-integrity checks cover globally unique ids, case ownership, revision parentage, current-revision membership, artifact path resolution and hashes, coordinate-frame consistency, mock labels, duplicate-request samples, and expected-result provenance.

## Shared use

`backend/ai/tests/integration/storage/fixture_loader.py` is a test-only loader. It copies artifact bytes into a temporary `LocalArtifactStore` and seeds cases, sources, candidate revisions, and the review sentinel through public `skullfix_ai.storage` interfaces. It does not modify these fixture files and is not a public import API.

The backend and frontend can reuse the same ids and public references for deterministic demos. Neither side should treat the fixture-local path as the production artifact API.

Fixture validation and storage-foundation tests are runnable now. Operation-service, API/SSE, adapter, and model scenarios remain planned. Real measurement, editing, inspection, comparison, contour guidance, and browser execution remain unavailable until their separate contracts are agreed.
