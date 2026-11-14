# AI assignment index

Published in this stack so far: schemas and fixtures, SQLite storage/artifacts.

1. Workflow and Bedrock: agent/ and integrations/bedrock/; their component tests.
2. Tools/context/operations: tools/, operations/, integrations/workspace/ and integrations/geometry/; corresponding component tests.
3. API/persistence: api/ and storage/; corresponding component tests.
4. Evaluation: tests/integration/workflows/, tests/live/ and evaluation/.

Main agent owns shared schemas, composition, fixtures shared across tests, and preflight template. Agents do not edit the same files concurrently. Separate per-task preflight records prevent overwrites. The live app backend remains canonical; Python sandbox work does not duplicate its authority. Live tests are opt-in.
