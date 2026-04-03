import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = REPO_ROOT / "agents"


def test_agents_must_use_data_access_lib_not_raw_boto3_dynamodb() -> None:
    """CI Policy: Agents must use data-access-lib for DynamoDB.
    Raw boto3.resource('dynamodb') or boto3.client('dynamodb') is forbidden.
    """
    forbidden_patterns = [
        re.compile(r"boto3\.resource\(['\"]dynamodb['\"]\)"),
        re.compile(r"boto3\.client\(['\"]dynamodb['\"]\)"),
    ]

    # We only check agent handlers, not the data-access-lib itself or tests.
    for handler_path in AGENTS_DIR.glob("**/handler.py"):
        content = handler_path.read_text(encoding="utf-8")
        for pattern in forbidden_patterns:
            assert not pattern.search(content), (
                f"Forbidden raw boto3 DynamoDB call found in {handler_path}. "
                "Use data-access-lib (TenantScopedDynamoDB) instead."
            )


def test_omx_agents_must_be_async() -> None:
    """CI Policy: Agents identified as OMX/Orchestration agents must be async."""
    for agent_dir in AGENTS_DIR.iterdir():
        if not agent_dir.is_dir():
            continue

        handler_path = agent_dir / "handler.py"
        pyproject_path = agent_dir / "pyproject.toml"

        if not handler_path.exists() or not pyproject_path.exists():
            continue

        handler_content = handler_path.read_text(encoding="utf-8")
        pyproject_content = pyproject_path.read_text(encoding="utf-8")

        # If it uses DurableSession, it's an OMX agent and MUST be async
        if "DurableSession" in handler_content:
            assert 'invocation_mode = "async"' in pyproject_content, (
                f"Agent in {agent_dir} uses DurableSession but is not configured as 'async'. "
                "Orchestration agents must be async."
            )


def test_claudemd_must_contain_omx_rules() -> None:
    """CI Policy: CLAUDE.md must contain the OMX-Flow rules for AI assistants."""
    claude_md = REPO_ROOT / "CLAUDE.md"
    content = claude_md.read_text(encoding="utf-8")
    assert "SDLC & Orchestration (OMX-Flow)" in content
    assert "The OMX Rule" in content
    assert "The Kanban Rule" in content
    assert "The Durable Rule" in content
