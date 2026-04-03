# OMX Orchestration — Refactor Team

This file defines the **OMX-Flow** orchestration for refactoring the `tf-acore-aas` repository. It uses specialized agent roles and a durable state machine to ensure a clean extraction of scope and specifications.

## The Team

| Role | Responsibility | Agent Alias |
|------|----------------|-------------|
| **Architect** | Extracts scope, qualifies tech debt, and defines the target spec. | `$architect` |
| **Planner** | Decomposes the spec into a concrete SDLC and task list. | `$plan` |
| **Executor** | Implements scaffolding, rules, instructions, and CI. | `$executor` |
| **Reviewer** | Validates implementation against the spec and architectural rules. | `$reviewer` |

## Orchestration Flow

### 1. Extraction Phase (`$architect`)
*   **Goal:** Cleanly extract "The Good" and qualify "The Debt".
*   **Output:** `docs/REFACTOR_SPEC.md`
*   **Rules:** 
    *   MUST NOT propose changes yet.
    *   MUST identify every instance of raw `boto3` DynamoDB access.
    *   MUST document the 4-layer isolation model in detail.

### 2. SDLC Phase (`$plan`)
*   **Goal:** Define the development process and orchestration rules.
*   **Output:** `docs/REFACTOR_SDLC.md`
*   **Rules:**
    *   MUST integrate **Cline Kanban** (`scripts/codex_flow`) as the primary task engine.
    *   MUST define the branching and worktree strategy.

### 3. Implementation Phase (`$executor`)
*   **Goal:** Scaffold the OMX-ready agent and CI rules.
*   **Output:** `agents/template-omx/`, `.gitlab-ci.yml` updates.
*   **Rules:**
    *   MUST enforce the `DurableSession` pattern.
    *   MUST ensure all agents are `async` by default.

### 4. Validation Phase (`$reviewer`)
*   **Goal:** Verify the refactor matches the spec.
*   **Rules:**
    *   MUST run `tests/unit/test_omx_policy.py`.
    *   MUST verify `CLAUDE.md` updates.

## State Management

Every orchestration session is tracked in `.omx/state/`.
- **Plan:** `$plan --init`
- **Status:** `$plan --status`
- **Handover:** `$team --handoff <role>`

## Command Reference

- **Extract Scope:** `omx team $architect "Extract scope and debt from src/ and infra/"`
- **Create SDLC:** `omx team $plan "Create SDLC and process for OMX-Flow"`
- **Verify Policy:** `omx team $reviewer "Validate CI and CLAUDE.md against the new spec"`
