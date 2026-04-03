"""
platform_tools.agent_wrapper — Unified wrapper for Bedrock AgentCore with OMX support.

Provides an enhanced BedrockAgentCoreApp that automatically manages
DurableSession and TenantContext based on the invocation payload.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any, TypeVar

from aws_lambda_powertools import Logger
from bedrock_agentcore import BedrockAgentCoreApp, RequestContext
from data_access import TenantContext, TenantScopedDynamoDB, TenantTier

from platform_tools.orchestration import DurableSession

logger = Logger(service="agent-wrapper")

T = TypeVar("T")


class OMXAgentApp(BedrockAgentCoreApp):
    """Enhanced AgentCore App with built-in Durable Session management."""

    def omx_entrypoint(
        self, func: Callable[[dict[str, Any], RequestContext, DurableSession], Any]
    ) -> Callable:
        """Decorator for entrypoints that require a durable OMX session."""

        @self.entrypoint
        def wrapper(payload: dict[str, Any], context: RequestContext) -> Any:
            session_id = context.session_id or str(uuid.uuid4())
            tenant_id = str(payload.get("tenantId", "unknown"))
            app_id = str(payload.get("appid", "unknown"))

            # 1. Resolve Tenant Context (In a real system, this would fetch from platform metadata)
            # For now, we use a basic context derived from the payload.
            ctx = TenantContext(
                tenant_id=tenant_id,
                app_id=app_id,
                tier=TenantTier.BASIC,
                sub=payload.get("actingSub", "system"),
            )

            # 2. Initialize Durable Session
            db = TenantScopedDynamoDB(ctx)
            session = DurableSession(db, session_id)
            session.load(tenant_id, app_id)

            logger.append_keys(session_id=session_id, tenant_id=tenant_id)

            # 3. Invoke the actual handler
            return func(payload, context, session)

        return wrapper
