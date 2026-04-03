# AG-UI Bootstrap Contract (ISSUE-385)

## 1. Overview
The AG-UI Bootstrap process is the control-plane handshake that allows the SPA to establish a secure, interactive session with a per-agent AgentCore Runtime.

## 2. Bootstrap Request
**Endpoint:** `POST /v1/agents/{agentName}/ag-ui/bootstrap`
**Auth:** Entra ID Bearer JWT

| Field | Type | Description |
|-------|------|-------------|
| `agentName` | string | (Path) The canonical name of the agent. |
| `transportPreference` | string | Optional. `sse` (default) or `websocket`. |
| `sessionSettings` | object | Optional. Per-agent session overrides (e.g. `voiceEnabled`). |
| `clientContext` | object | Optional. Telemetry fields from the SPA (e.g. `browser`, `screenSize`). |

## 3. Bootstrap Response
**Status:** `200 OK`

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | The stable platform session identifier. |
| `runtimeSessionId` | string | The internal AgentCore runtime session identifier. |
| `connectUrl` | string | The direct URL for the interactive session. |
| `transport` | string | The confirmed transport (`sse` or `websocket`). |
| `accessToken` | string | A short-lived, scoped token for runtime-facing auth. |
| `expiresAt` | string | ISO 8601 timestamp for token expiry. |
| `metadata` | object | Agent-specific UI configuration (e.g. `theme`, `supportedCapabilities`). |

## 4. Discovery Metadata
Agents that support AG-UI MUST include the following in their registry metadata:

```json
{
  "capabilities": {
    "agUi": {
      "supported": true,
      "version": "1.0.0",
      "transports": ["sse"],
      "uiSchema": "v1-standard"
    }
  }
}
```

## 5. Error Semantics

| Code | HTTP | Description |
|------|------|-------------|
| `AGENT_NOT_CAPABLE` | 400 | The requested agent does not support AG-UI. |
| `SESSION_QUOTA_EXCEEDED` | 429 | Tenant or agent has reached the maximum concurrent AG-UI sessions. |
| `RUNTIME_UNAVAILABLE` | 503 | The per-agent runtime failed to initialize or is unreachable. |

## 6. Telemetry & Audit
Every bootstrap success MUST record a `SESSION#` record in `platform-sessions` with:
- `bootstrapRequestId`
- `tenantId` / `appId`
- `agentName`
- `transport`
- `occurredAt`
