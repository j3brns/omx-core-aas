# Refactor Master Task List (OMX-Flow)

This task list defines the steps to move the project from its current state to the "Fresh" orchestration-first architecture.

## Phase 1: Foundation (Tech Debt Cleanup)
- [ ] **[TASK-001]** Refactor `src/authoriser/handler.py`: Replace raw boto3 with `ControlPlaneDynamoDB`.
- [ ] **[TASK-002]** Refactor `src/billing/handler.py`: Replace raw boto3 with `TenantScopedDynamoDB`.
- [ ] **[TASK-003]** Refactor `src/bridge/handler.py`: Replace raw boto3 with `ControlPlaneDynamoDB`.
- [ ] **[TASK-004]** Consolidate all READMEs and outdated TASK.md into a single, authoritative `README.md`.

## Phase 2: Orchestration Layer (The "Implant")
- [ ] **[TASK-005]** Finalize `src/platform_tools/orchestration.py`: Implement `DurableSession` and `KanbanTask`.
- [ ] **[TASK-006]** Infrastructure: Add `platform-sessions` DynamoDB table to the CDK stacks in `infra/cdk`.
- [ ] **[TASK-007]** SDK Update: Integrate `DurableSession` into the `bedrock-agentcore` wrapper for easier agent consumption.

## Phase 3: Agent Scaffolding (OMX-Ready)
- [ ] **[TASK-008]** Scaffold `agents/omx-orchestrator`: A reference "Manager" agent using the Durable Session.
- [ ] **[TASK-009]** Scaffold `agents/omx-planner`: A specialized sub-agent for decomposing prompts.
- [ ] **[TASK-010]** Update `make scaffold-agent` to support the OMX template by default.

## Phase 4: CI & Policy Enforcement
- [ ] **[TASK-011]** Implement `tests/unit/test_omx_policy.py`: Automated checks for raw boto3 and async-mode mandates.
- [ ] **[TASK-012]** Update `.gitlab-ci.yml`: Integrate the policy validation into the `validate` stage.

## Phase 5: Closure
- [ ] **[TASK-013]** Run a full `omx team $reviewer` pass to verify all tasks against the specification.
- [ ] **[TASK-014]** Promote to "Fresh" state and tag the repository.
