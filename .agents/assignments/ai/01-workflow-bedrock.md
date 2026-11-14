# Assignment: AI workflow and Bedrock

Status: blocked until `features/ai-workspace-assistant/intent.md` and `spec.md` are explicitly accepted. Accepting one does not accept the other. Write `plan.md` before coding. Separate plan approval is not required unless the user asks. This status is not acceptance.

## Before coding

Read `features/ai-workspace-assistant/intent.md` and `spec.md`. The main agent assigns `features/ai-workspace-assistant/preflights/<task-id>.md` before delegation. Copy the ten items from `features/ai-workspace-assistant/preflight.md` into that record, name this agent as the editor, and answer them there. Do not replace the template, and do not edit another task's record. Use the shared schemas from the main agent. Do not invent a second result schema. The checklist does not replace the intent, spec, or plan, does not authorize coding by itself, and is not another approval gate. If the task grows, update that same record before more code.

## Goal

Implement the LangGraph run that loads context, selects one registered tool, calls Bedrock for the explanation step, and stops on unsupported or stale requests. Requirements: R2, R4, R9, R14's rule that the model does not emit mesh coordinates, R18.

## Owns

- `backend/ai/src/skullfix_ai/agent/`
- `backend/ai/src/skullfix_ai/integrations/bedrock/`
- `backend/ai/tests/unit/agent/`
- `backend/ai/tests/unit/integrations/bedrock/`
- `backend/ai/tests/integration/agent/`

## Must not edit

- `schemas/` after the main agent publishes them
- `api/`, `storage/`, `operations/`, `tools/`
- Test paths owned by agents 02, 03, or 04, and the main agent's shared test files
- Teammate frontend or geometry code

## Tests

Write a failing test in the owned test paths before implementing the requirement it covers. Fixtures for those tests stay inside those directories. The canonical map and coordination rules are in [README.md](README.md).

Missing `SKULLFIX_AI_MODEL_ID` is a deterministic unit test under `tests/unit/integrations/bedrock/`. It must not call Bedrock. Live provider checks belong to agent 04 in `tests/live/` and stay opt-in.

## Interfaces

- Input: the request schema and the workspace snapshot schema from `schemas/`.
- Tool choice: the registry in `tools/`. Call only a name that registry returns.
- Output: an explanation that quotes the tool result. If a number is not in the result, fail the explanation step.
- Bedrock: read `SKULLFIX_AI_MODEL_ID` and AWS settings from the environment. Do not hardcode a model id or a key.

## Depends on

- Explicit acceptance of `intent.md` and `spec.md`, a written `plan.md`, and a filled preflight record at the path the main agent assigned. Separate plan approval is not required unless the user asks. The checklist is not another approval gate.
- Shared schemas and the tool registry protocol from the main agent.
- A fake workspace snapshot. Do not wait on the live workspace URL.

## Done when

- A test in `tests/unit/agent/` or `tests/integration/agent/` returns the fake tool's value in the explanation and rejects an explanation that adds a new number.
- An unsupported user message ends without a tool call that writes geometry.
- A unit test in `tests/unit/integrations/bedrock/` fails closed when `SKULLFIX_AI_MODEL_ID` is missing and does not call the network.

## Handoff

Return the graph entry function and the Bedrock client interface. Note any schema field you needed that was missing. Do not mark S1 as a live geometry success.
