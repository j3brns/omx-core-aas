"""
handler.py — Template for OMX-Flow Durable Orchestration Agents.

Mandatory Patterns:
1. Durable State: Initialize DurableSession at the start of every invocation.
2. Async Mode: Use async invocation mode for multi-step tasks.
3. Team Delegation: Decompose complex tasks into sub-tasks (Kanban).
"""

from typing import Any

from aws_lambda_powertools import Logger
from bedrock_agentcore import BedrockAgentCoreApp, RequestContext
from data_access import TenantContext, TenantScopedDynamoDB, TenantTier

from platform_tools.orchestration import DurableSession, KanbanTask

logger = Logger(service="omx-agent")
invoke = BedrockAgentCoreApp()


@invoke.entrypoint
def handler(payload: dict[str, Any], context: RequestContext) -> Any:
    session_id = context.session_id
    tenant_id = str(payload.get("tenantId", "unknown"))
    app_id = str(payload.get("appid", "platform"))

    # 1. Setup Tenant Context and Durable Session
    # In production, tier and other metadata are resolved from the platform.
    ctx = TenantContext(tenant_id=tenant_id, app_id=app_id, tier=TenantTier.BASIC, sub="omx-agent")
    db = TenantScopedDynamoDB(ctx)
    session = DurableSession(db, session_id)
    state = session.load(tenant_id, app_id)

    # 2. Orchestration Logic
    if not state.plan:
        # PHASE: PLANNING
        # Analyze prompt and create a Kanban-aligned plan
        state.plan = ["Analyze", "Execute", "Review"]
        for step in state.plan:
            state.tasks.append(KanbanTask(title=step, lane="backlog"))

        state.tasks[0].lane = "doing"
        session.save()

        return {"status": "planned", "plan": state.plan, "session_id": session_id}

    # PHASE: EXECUTION
    current_task = next((t for t in state.tasks if t.lane == "doing"), None)
    if current_task:
        # Perform work or delegate to sub-agent here
        logger.info(f"Executing task: {current_task.title}")

        # Mark current as done, move to next
        current_task.lane = "done"
        next_task = next((t for t in state.tasks if t.lane == "backlog"), None)
        if next_task:
            next_task.lane = "doing"
            session.save()
            return {
                "status": "in_progress",
                "completed": current_task.title,
                "next": next_task.title,
            }

    session.save()
    return {"status": "complete", "message": "All orchestration steps finished."}
