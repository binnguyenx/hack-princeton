# LangGraph / LangChain Deep Agent Integration Guide

## 1. Overview & Architecture

This document specifies the integration architecture, HTTP API contracts, Server-Sent Events (SSE) protocol, and frontend client setup for connecting the cranial vault reconstruction 3D editor with a LangChain / LangGraph Deep Agent.

The integration provides a collapsible right-side chat column within the 3D Canvas Workspace (`CanvasWorkspace.tsx`). The interface enables biomedical engineers and surgeons to query anatomical measurements, evaluate implant candidates, analyze slice margins, and draft clinical reconstruction constraints alongside the 3D viewport.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Canvas Workspace                              │
│ ┌───────────────────────────────────────────────┐ ┌──────────────────┐ │
│ │ 3D Viewport & Synchronized Slices             │ │ AI Assistant     │ │
│ │                                               │ │ [Mock/Live Badge]│ │
│ │  • Interactive 3D Cranial Defect Model        │ │                  │ │
│ │  • Axial / Sagittal / Coronal slice crosshairs│ │ Context: Case 1  │ │
│ │  • W/L intensity windowing & landmark place   │ │                  │ │
│ │                                               │ │ Message Feed     │ │
│ │                                               │ │ Prompt Chips     │ │
│ │                                               │ │ Input & Send     │ │
│ └───────────────────────────────────────────────┘ └──────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                         (SSE Stream via HTTP)
                                    ▼
           ┌─────────────────────────────────────────────────┐
           │ LangGraph Server / LangGraph Cloud Agent Host   │
           │  • Thread persistence (SQLite / Postgres)       │
           │  • StateGraph with Cranial Reconstruction Tools  │
           │  • Streaming token & message updates            │
           └─────────────────────────────────────────────────┘
```

---

## 2. LangGraph HTTP API Specification

LangGraph Cloud / LangGraph Server exposes a RESTful HTTP protocol communicating via Server-Sent Events (SSE).

### 2.1 Thread Creation

Initializes an isolated, persistent conversation state.

- **Route:** `POST /threads`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "metadata": {
      "case_id": "case-uuid",
      "user_role": "biomedical-engineer"
    }
  }
  ```
- **Response:** `200 OK`
  ```json
  {
    "thread_id": "thread-e07e382d-8b09-4ce4-8fa2-68e1ddba3f00",
    "created_at": "2026-11-14T13:40:00Z",
    "metadata": { "case_id": "case-uuid" },
    "status": "idle"
  }
  ```

---

### 2.2 Streaming Agent Execution (SSE)

Triggers the graph execution and streams chunks to the client.

- **Route:** `POST /threads/{thread_id}/runs/stream`
- **Method:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `Accept: text/event-stream`

#### Request Payload
```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [
      {
        "role": "human",
        "content": "Analyze the parietotemporal defect dimensions on the active sample."
      }
    ]
  },
  "config": {
    "configurable": {
      "model": "claude-3-7-sonnet",
      "temperature": 0.2
    }
  },
  "stream_mode": ["messages", "updates"]
}
```

#### Stream Modes
- `messages`: Emits token-by-token LLM chunks (`AIMessageChunk`) for responsive UI typing.
- `updates`: Emits state updates produced by individual tool nodes.
- `values`: Emits full graph state snapshots after each step.

---

### 2.3 Server-Sent Events (SSE) Protocol

The response stream delivers newline-delimited event packets:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: metadata
data: {"run_id": "run-4f9a0c12-32a1", "attempt": 1}

event: messages
data: [{"id": "msg-01", "content": "Looking at the active sample, ", "type": "AIMessageChunk"}]

event: messages
data: [{"id": "msg-01", "content": "here are the key measurements:\n• Defect area: ~12.4 cm²", "type": "AIMessageChunk"}]

event: updates
data: {"analyze_defect_node": {"defect_area_cm2": 12.4, "max_depth_mm": 8.2}}

event: end
data: {}
```

#### Event Handling Specification
| Event | Content | Frontend Behavior |
|---|---|---|
| `metadata` | `{ run_id: string }` | Records active execution ID for telemetry / cancellation. |
| `messages` | `Array<{ id, content, type }>` | Updates the active message bubble content and renders streaming cursor `▌`. |
| `updates` | `Record<string, unknown>` | Ingests structured node outputs (e.g., coordinates, proposed implant parameters). |
| `end` | `{}` | Finalizes streaming, dismisses typing cursor, unlocks input. |
| `error` | `{ message: string }` | Displays error alert banner in chat feed. |

---

## 3. Frontend Implementation & Mock Support

### 3.1 Architecture Overview

The frontend implementation consists of two core files under `app/src/`:

1. `app/src/ai/langGraphClient.ts`:
   - Handles HTTP POST / SSE communication with LangGraph Server.
   - Built-in **Mock Provider** simulating streaming message generation, defect metrics, candidate constraints, and margin analysis when no live server is connected.
   - Seamlessly switches to live network requests when `VITE_LANGGRAPH_API_URL` is configured.

2. `app/src/ui/AiChatPanel.tsx`:
   - Implements the complete chat column interface with context strip, message bubbles, suggestion prompt chips, textarea input, and action buttons.
   - Respects all design system rules in `DESIGN.md`.

3. `app/src/ui/CanvasWorkspace.tsx`:
   - Renders the AI Chat Column as a full right-side column within the `.cross-reference-workbench` grid.
   - Supports toggling via context toolbar (`canvas-context-action`), dock edge tab (`canvas-chat-edge-tab`), and panel header collapse button.

---

### 3.2 Environment Configuration

To point the frontend to a running LangGraph server, configure `.env.local`:

```env
# URL where your LangGraph Server or LangGraph Studio is running
VITE_LANGGRAPH_API_URL=http://localhost:2024

# Assistant / graph ID defined in langgraph.json
VITE_LANGGRAPH_ASSISTANT_ID=agent
```

When `VITE_LANGGRAPH_API_URL` is omitted or empty, the client runs in **Mock mode** (indicated by the `Mock` pill badge in the header).

---

### 3.3 Design System Adherence (`DESIGN.md`)

- **Soft Monochrome Palette:**
  - Base ground: `#F0F2F5` (`--color-base`)
  - Elevated surfaces: `#FFFFFF` (`--color-elevated`)
  - Ink text: `#1A1D21` (`--color-ink`)
  - Hairline borders: `#E4E6EA` (`--color-border`)
- **Accent Hierarchy:**
  - Blue accent (`#2F6BFF`) reserved exclusively for strong actions:
    - Send button (`.ai-chat-send-btn`)
    - Human message bubbles (`.ai-chat-msg--human .ai-chat-bubble`)
    - Active toggle highlight (`.is-active`)
- **Typography & Motion:**
  - SF Pro Text / Segoe UI workhorse typography.
  - Corporate calm easing: `cubic-bezier(0.2, 0, 0, 1)`.
  - Accessible contrast ratios and full `prefers-reduced-motion` compliance.

---

## 4. Verification & Testing

Unit and integration tests for the AI chat panel and its canvas integration are located in `app/tests/ui/aiChatPanel.test.tsx`.

Run tests:
```bash
cd app && npx vitest run tests/ui/aiChatPanel.test.tsx
```

All 5 test suites verify:
1. Panel rendering, context display, and header elements.
2. Collapsing and expanding state transitions.
3. User prompt submission and token-by-token streamed mock responses.
4. One-click suggestion prompt chip interactions.
5. CanvasWorkspace right-column integration.
