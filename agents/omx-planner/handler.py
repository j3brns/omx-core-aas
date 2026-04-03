"""
omx-planner handler — Specialized agent for task decomposition.

Decodes a vague request into a concrete list of steps (Plan) and
initializes the session's Kanban board.
"""

from typing import Any

from aws_lambda_powertools import Logger
from bedrock_agentcore import RequestContext

from platform_tools.agent_wrapper import OMXAgentApp
from platform_tools.orchestration import DurableSession, KanbanTask

logger = Logger(service="omx-planner")

# Enhanced OMX application
invoke = OMXAgentApp()


@invoke.omx_entrypoint
def handler(payload: dict[str, Any], context: RequestContext, session: DurableSession) -> Any:
    """Decomposes a prompt into a durable plan."""
    prompt = str(payload.get("prompt", ""))
    state = session.state

    logger.info("Decomposing prompt", extra={"prompt": prompt})

    # In a real agent, this would call Bedrock to generate the plan.
    # For this scaffold, we use a mock decomposition logic.
    if "refactor" in prompt.lower():
        state.plan = ["Extract Scope", "Qualify Debt", "Implement Refactor", "Validate"]
    elif "deploy" in prompt.lower():
        state.plan = ["Build", "Test", "Plan Infra", "Apply"]
    else:
        state.plan = ["Analyze", "Execute", "Verify"]

    # Initialize Kanban
    state.tasks = []
    for step in state.plan:
        state.tasks.append(KanbanTask(title=step, lane="backlog", role="executor"))

    state.tasks[0].lane = "doing"
    state.metadata["decomposed_by"] = "omx-planner"

    session.save()

    return {"status": "decomposed", "plan": state.plan, "tasks_initialized": len(state.tasks)}
