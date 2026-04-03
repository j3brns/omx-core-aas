# Project Specification & Scope Extraction

## 1. Executive Summary
This document defines the extracted scope, core value proposition, and technical debt of the `tf-acore-aas` platform. It establishes the baseline for integrating a durable, team-based agent orchestration layer utilizing **Oh-My-Codex (OMX)** patterns and **Cline Kanban** for task management.

## 2. "The Good": Core Value Extraction
The platform possesses strong, production-ready foundations that must be preserved and strictly adhered to during the refactor:

*   **Multi-Tenant Isolation Model:** The 4-layer security model (Authoriser -> Bridge STS -> Interceptors -> `data-access-lib`) is highly robust. `TenantScopedDynamoDB` and `TenantScopedS3` are exceptional patterns for preventing cross-tenant data bleed.
*   **Invocation Modes:** The separation of `sync`, `streaming`, and `async` invocation modes cleanly maps to different agent workload profiles.
*   **Infrastructure as Code (IaC):** The CDK/Terraform split (ADR-007) and the regional zigzag topology (London Control Plane / Dublin Compute Plane) demonstrate mature systems engineering.
*   **Act-on-Behalf Identity:** Passing scoped tokens to tools rather than the original user JWT (ADR-004) is a critical security pattern to maintain.

## 3. Tech Debt Qualification
The platform's current state exhibits specific areas of debt that limit its ability to scale agentic workloads:

*   **Architectural Violations (High Severity):** Handlers (like the Authoriser) bypassing `data-access-lib` to use raw `boto3` for DynamoDB access. This undermines the core isolation guarantees.
*   **Orchestration Immaturity (Medium Severity):** The current `echo-agent` and A2A (Agent-to-Agent) examples rely on synchronous, HTTP-bound orchestration. There is no native primitive for "durable state," meaning a failing sub-agent drops the entire workflow.
*   **State Management (Medium Severity):** Complex multi-step agent reasoning cannot currently survive the 15-minute sync timeout without writing bespoke async polling logic from scratch every time.

## 4. Target Orchestration: OMX + Kanban
To solve the orchestration immaturity, the platform will implant **Oh-My-Codex (OMX)** principles managed via a **Kanban** lifecycle.

### The OMX Orchestration Layer
Instead of agents being simple stateless functions, complex workflows will utilize an **OMX-Flow**:
1.  **Durable Teams:** Workloads are assigned to an `Orchestrator` agent, which maintains a durable state file (e.g., in `platform-sessions` or S3) detailing the overall Plan, the current Task, and the Memory context.
2.  **Role Specialization:** The Orchestrator delegates to specialized sub-agents (e.g., `Architect`, `Executor`, `Reviewer`).
3.  **Async-First:** Orchestrated teams default to `async` invocation mode. The orchestrator wakes up, assesses state, delegates a task, updates the durable state, and goes back to sleep (or yields), preventing timeout exhaustion.

### The Management Layer: Cline Kanban
*   Task scoping and SDLC are managed locally via `scripts/codex_flow` (or a similar local CLI Kanban board). 
*   This decouples AI reasoning from rigid GitHub issue labels while maintaining a strict `Backlog -> Doing -> Blocked -> Done` state machine.

## 5. System Boundaries (What is OUT of Scope)
*   **Modifying the Infrastructure Topology:** The London/Dublin region split and the Firecracker microVM execution model remain unchanged.
*   **Replacing Entra ID:** Authentication remains tied to Entra OIDC/JWT. No Cognito will be introduced.
