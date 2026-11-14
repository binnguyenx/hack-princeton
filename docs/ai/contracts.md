# AI/backend publication status

This branch implements sqlite schema-v2 application storage and coordinated local-artifact lifecycle. It is an isolated Python foundation; the shipped TypeScript app remains authoritative for live UI projects and candidates. No Python demo record is a live UI record.

Implemented here: schemas and fixtures, SQLite storage/artifacts. Still deferred: operation service, adapters, live workspace integration, API transport and models. Reconstruction mock output, when available, is synthetic and is not NRRD reconstruction. Proposed R35–R39 recovery behavior and real operation contracts are not accepted by this publication.

## Verification

Install Python 3.11+ and run `python3 -m pip install -e backend/ai`. From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B backend/ai/tests/run_checks.py
```

Expected: 42 tests and OK. No AWS/network calls are required. Tests verify only this slice and its prerequisites, not API/SSE, models, real geometry, or automatic recovery.

## Structural contracts

The source of requirements is features/ai-workspace-assistant/spec.md. Public synthetic artifacts use retrieval_url, artifact identity, SHA-256 hash and media type. Canonical mock commands retain full selection identity, geometry revision and frame. Input/output/event variants are defined in skullfix_ai.schemas and fixture samples. Validation does not prove case membership, freshness, capability, geometry quality or persistence.

## Live app boundary

app/src/domain/types.ts and app/src/api/client.ts define Project → Case → Sample → Candidate → Revision, raw NRRD hashes and flat poses. Do not substitute standalone sandbox records for those objects. The workspace reader and sandbox database guard are deferred to the app-integration PR; live AI mutation remains unavailable.
