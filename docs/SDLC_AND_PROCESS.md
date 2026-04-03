# SDLC and Orchestration Process

## 1. Introduction
This document defines the Software Development Life Cycle (SDLC) and the rules of engagement for this repository. It utilizes **oh-my-codex (OMX)** as the primary development engine and **Cline Kanban** for fine-grained task management.

## 2. The SDLC Loop

The development loop is agent-driven and proceeds through four distinct OMX phases:

### Phase 1: Extraction & Qualification (`$architect`)
Before modifying code, the Architect agent MUST perform a surgical extraction:
- **Command:** `omx team $architect "Extract [SCOPE] from [FILES/DIRS] and qualify tech debt"`
- **Output:** A clear mapping of "The Good" to be preserved and "The Debt" to be refactored.

### Phase 2: Specification & Planning (`$plan`)
The Planner agent decomposes the architecture into a concrete task list:
- **Command:** `omx team $plan "Decompose specification into a task list for [FEATURE/REFACTOR]"`
- **Output:** A Kanban-aligned task list that must be synchronized with `scripts/codex_flow`.

### Phase 3: Implementation & Execution (`$executor`)
The Executor agent performs the coding, scaffolding, and CI updates:
- **Command:** `omx team $executor "Implement [TASK_ID] within isolated worktree"`
- **Requirements:** 
    - Every task MUST occur in a fresh Git worktree (`make worktree`).
    - The task lane MUST be set to `doing`.
    - A detailed `note` file MUST be initialized.

### Phase 4: Validation & Review (`$reviewer`)
The Reviewer agent validates the implementation:
- **Command:** `omx team $reviewer "Validate implementation against CI policies and spec"`
- **Requirements:**
    - All unit and integration tests MUST pass.
    - All OMX policies (Durable Session, Isolation) MUST be verified.

---

## 3. The Durable Rule (OMX-Flow)

When building orchestration agents for the platform itself:
*   **Mandatory Primitive:** Use `platform_tools.orchestration.DurableSession` to persist Plan and Task state to `platform-sessions` in DynamoDB.
*   **Mandatory Async:** Use `invocation_mode = "async"`.
*   **Mandatory Delegation:** Decompose monolithic agents into specialized sub-agents tracked via the durable state.
