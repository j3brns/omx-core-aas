# Refactoring Strategy & Orchestration Specification

## 1. Project Health and Tech Debt Assessment

### Technical Debt Identified
- **Architectural Violation (High Risk):** `src/authoriser/handler.py` uses raw `boto3` for DynamoDB access. This bypasses the security controls in `data-access-lib`.
- **Documentation Fragmentation:** Documentation is spread across multiple README files (`README.md`, `README2.md`, `README3.md`).
- **Orchestration Simplicity:** Current orchestration in `echo-agent` is synchronous, manual, and lacks durable state management.

### "Extract the Good" (Core Strengths)
- **`data-access-lib`:** Robust, security-first multi-tenant isolation.
- **`scripts/codex_flow`:** Effective Kanban-based task management for AI agents.
- **Bridge Architecture:** Well-defined invocation modes (sync, streaming, async) and regional failover.

---

## 2. Orchestration Strategy: "OMX-Flow"

The goal is to transition from simple synchronous calls to a **Durable Agent Team Orchestration** model, inspired by `oh-my-codex`.

### Model: OMX-Flow
- **Orchestrator Role:** A specialized agent that takes a vague prompt and manages a "Team" of sub-agents.
- **Durable State:** Every session maintains a state directory in S3 (e.g., `tenants/{tenant_id}/sessions/{session_id}/.omx/`) containing logs, thoughts, and plans.
- **Kanban Alignment:** Each major step in an orchestration session is tracked as a `Card` in a virtual Kanban board (compatible with `codex_flow` schema).

### Orchestration Rules
1. **Durable First:** Every orchestration MUST persist its state to S3/DynamoDB after each significant action.
2. **Specialized Agents:** Teams MUST consist of at least a `Planner`, an `Executor`, and a `Reviewer`.
3. **Async Default:** Multi-step orchestration SHOULD run in `async` mode to survive long-running tasks.
4. **Tenant Isolation:** All persistence MUST flow through `data-access-lib`. No raw `boto3` calls permitted in orchestration logic.

---

## 3. Scaffolding Plan

### Phase 1: Tech Debt Cleanup
- [ ] Refactor `src/authoriser/handler.py` to use `data-access-lib`.
- [ ] Consolidate README files into a single `README.md`.

### Phase 2: Orchestration Scaffolding
- [ ] Create `src/orchestration-lib` providing `DurableSession` and `KanbanTask` primitives.
- [ ] Implement `agents/omx-orchestrator` as a reference template.
- [ ] Add `make scaffold-agent-omx` to the root Makefile.

### Phase 3: Rule Integration
- [ ] Update `CLAUDE.md` and `GEMINI.md` with the new Orchestration Rules.
- [ ] Integrate `codex_flow` CLI into the agent runtime for task tracking.
