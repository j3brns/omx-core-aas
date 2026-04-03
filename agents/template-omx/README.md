# OMX-Flow Orchestration Agent Template

This template implements the **OMX-Flow** pattern for multi-agent durable orchestration.

## Mandatory Patterns

### 1. Durable Session (`platform_tools.orchestration`)
Every agent MUST initialize a `DurableSession` to persist its internal state (Plan, Tasks, Memory) across invocations.

### 2. Async Invocation Mode
Orchestration agents MUST use `invocation_mode = "async"` in `pyproject.toml`. This allows the orchestrator to survive long-running sub-agent delegations.

### 3. Team-Based Decomposition
Monolithic handlers are forbidden. Tasks must be decomposed into specialized roles (Planner, Executor, Reviewer) and tracked via a Kanban-aligned task list.

## Quick Start

1. Scaffold from this template.
2. Define your `Plan` in the `handler`'s initial entry (Planning phase).
3. Execute tasks by delegating to sub-agents via A2A (Agent-to-Agent) calls.
4. Update task lanes (`backlog` -> `doing` -> `done`) and `session.save()` after every step.
