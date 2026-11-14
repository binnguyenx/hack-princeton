# AI workstream workflow

Intent and spec remain separate. Their recorded foundation scope is accepted; proposed recovery and real mechanical contracts remain unresolved. Each coding task reads the relevant documents, records its own preflight, writes a plan, implements with TDD, and verifies. Separate plan approval is not required unless requested. A checklist does not grant acceptance.

Current implementation: schemas and fixtures, SQLite storage/artifacts. Deferred: operation service, adapters, live workspace integration, API transport and models.

The live UI uses its TypeScript backend. Python fixtures/mock storage are isolated. No graph or model capability is advertised by this branch.
