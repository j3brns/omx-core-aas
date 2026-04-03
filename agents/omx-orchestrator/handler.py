"""
omx-orchestrator handler — Durable multi-agent orchestration reference.

Implements the "OMX-Flow" pattern:
  - Durable State: Persisted to DynamoDB via platform_tools.orchestration.
  - Multi-step: Uses a task queue (Kanban) to track progress.
  - Team-based: Orchestrates sub-agents for specialized tasks.

Best used with 'async' mode for long-running workflows.
"""

import os
from typing import Any

from aws_lambda_powertools import Logger
from bedrock_agentcore import BedrockAgentCoreApp, RequestContext
from data_access import TenantScopedDynamoDB, TenantContext, TenantTier
from platform_tools.orchestration import DurableSession, KanbanTask

logger = Logger(service="omx-orchestrator")

# ASGI application
invoke = BedrockAgentCoreApp()

@invoke.entrypoint
def handler(payload: dict[str, Any], context: RequestContext) -> Any:
    """Entrypoint for the OMX orchestrator."""
    session_id = context.session_id
    tenant_id = str(payload.get("tenantId", "unknown"))
    app_id = str(payload.get("appid", "platform"))
    prompt = str(payload.get("prompt", ""))

    logger.append_keys(session_id=session_id, tenantid=tenant_id, appid=app_id)
    logger.info("OMX Orchestrator invoked", extra={"prompt": prompt})

    # 1. Initialize data access and durable session
    # In a real agent, the context is derived from the Bedrock session
    ctx = TenantContext(
        tenant_id=tenant_id,
        app_id=app_id,
        tier=TenantTier.BASIC, # Should be resolved from tenant metadata
        sub="omx-orchestrator"
    )
    db = TenantScopedDynamoDB(ctx)
    session = DurableSession(db, session_id)
    state = session.load(tenant_id, app_id)

    # 2. Process based on current state (Durable Execution)
    if not state.plan:
        # Step 1: Planning
        logger.info("Initializing plan for prompt")
        state.plan = ["Analyze requirements", "Scaffold components", "Review implementation"]
        
        # Add tasks to Kanban
        for step in state.plan:
            task = KanbanTask(title=step, lane="backlog")
            state.tasks.append(task)
        
        state.metadata["original_prompt"] = prompt
        state.tasks[0].lane = "doing"
        state.tasks[0].note = "Analyzing requirements based on prompt..."
        
        session.save()
        
        return {
            "status": "planned",
            "session_id": session_id,
            "next_step": state.plan[0],
            "kanban": [t.to_dict() for t in state.tasks]
        }

    # Step 2+: Continue existing plan
    # In a real async agent, this would be a loop or a state machine
    # calling sub-agents via A2A.
    
    current_task = next((t for t in state.tasks if t.lane == "doing"), None)
    if current_task:
        logger.info("Continuing task", extra={"task": current_task.title})
        # Simulate work completion
        current_task.lane = "done"
        
        # Start next task
        next_task = next((t for t in state.tasks if t.lane == "backlog"), None)
        if next_task:
            next_task.lane = "doing"
            session.save()
            return {
                "status": "progressing",
                "completed": current_task.title,
                "next": next_task.title
            }
        
        session.save()
        return {
            "status": "complete",
            "summary": "All tasks in the plan are finished."
        }

    return {"status": "idle", "message": "No active tasks found."}
