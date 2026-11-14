# Plan: Read-only authoritative-context LangGraph and isolated mock execution

Spec: [../spec.md](../spec.md) · Status: done · Date: 2026-11-14

> Historical: records the scoped fake-model implementation. Shared feature docs remain draft where proposals are unresolved.

## Approach

Compile a bounded five-step LangGraph. Use repository-backed context and typed registered tools. Render explanations deterministically from actual tool observations and shared OperationResult objects. Preserve the application authority boundary; do not add model-selected live writes.

## Files that change

- agent/context.py: repository reader and validated request selection (R2, R3, R32, R58–R61).
- tools/registry.py: typed tool catalog, capability gating and validation (R4–R7).
- tools/inspection.py: read-only metadata observation, not a geometry inspection claim (R9, R63).
- tools/reconstruction.py: explicitly bound sandbox OperationService facade (R6, R14, R20–R22).
- agent/workflow.py and agent/__init__.py: fake-model protocol, genuine StateGraph, grounded explanation (R4, R9, R20, R34).
- tests/integration/agent/: representative red/green tests, failures, real repository context and canonical sandbox integration.

## Order of work

1. Write a context-inspection graph test and record the expected red state.
2. Implement typed registry, authoritative reader and genuine five-step graph.
3. Add failure-path tests and isolated service/mock integration.
4. Exercise graph against the new real application repository, restored pointers and fresh state.
5. Run graph plus backend regressions; update task records with evidence.

## Risks

An untrusted model must not select arbitrary Python callables, supply identity fields that replace authoritative context, inject explanation claims, or trigger live mutations. Sandbox command identities are supplied by an explicit application binding, not derived from live app identifiers. Real geometry remains unavailable.

## Proof

PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend/ai/src python3 -B -m unittest discover -s backend/ai/tests/integration/agent -v covers the listed R2–R7, R9, R14, R20–R22, R32–R34 and R58–R63 slices. This does not prove R35–R39, providers, streaming, real geometry, live mutation or clinical outcomes.

## Deviations

The repository read protocol uses `get_project_manifest(project_id)`, matching the implemented live application repository. The baseline `AppWorkspaceAdapter` rejects malformed legacy manifest metadata explicitly rather than rewriting records. A regression exposed malformed read-tool observations crashing explanation; authoritative output checks now reject missing or fabricated metadata. Shared docs/spec/dependency updates remain coordinator-owned.

## Verified evidence

Focused graph suite: 11 tests passed. Existing backend suite: 64 tests passed. Feature checker: 0 errors, 2 existing editor warnings. Whitespace check passed. Commands were run with the coordinator's isolated virtualenv interpreter at `/private/tmp/hp-implementation-venv/bin/python`.

Public graph API reference: https://reference.langchain.com/python/langgraph/graph/state/StateGraph (compile then invoke). No checkpoint or provider API is used.

## Invocation example

After installing the backend dependencies, invoke the graph in-process against an explicitly selected application root:

```python
from pathlib import Path
from skullfix_ai.application import ApplicationRepository
from skullfix_ai.agent import FakeToolModel, GraphRequest, RepositoryManifestReader, WorkspaceGraph
from skullfix_ai.integrations.workspace import AppWorkspaceAdapter
from skullfix_ai.tools import default_tool_registry

repository = ApplicationRepository(Path("/explicit/application/root"))
graph = WorkspaceGraph(
    AppWorkspaceAdapter(RepositoryManifestReader(repository)),
    FakeToolModel(),
    default_tool_registry(),
)
outcome = graph.invoke(GraphRequest(
    request_id="request-demo", conversation_id="conversation-demo",
    project_id="existing-project-id", case_id="existing-case-id",
    object_id="existing-candidate-id", message="Describe the selected revision metadata.",
))
print(outcome.model_dump_json(indent=2))
```

Use existing IDs from the selected root. This example reads context only and starts no HTTP server. Tests create disposable roots and records themselves. The default registry has no sandbox binding and cannot generate any candidate. Opt-in sandbox tests show `SandboxReconstructionBinding` using a separately initialized `SQLiteApplicationStorage`, never this application repository. Contour-guided generation remains unsupported and is absent from the registry.
