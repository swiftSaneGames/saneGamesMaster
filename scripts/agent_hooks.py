#!/usr/bin/env python3
"""Small Claude Code project hooks; no network, file writes, or content logging.

The edit guard is an accidental-edit check, not a security boundary. It does not
intercept Bash, other tools, hard links, races, or external processes.
"""
import json
import os
from pathlib import Path
import sys


MAX_INPUT_BYTES = 1024 * 1024
EDIT_TOOLS = frozenset({"Write", "Edit"})
SIGNING_SUFFIXES = frozenset({".p12", ".pfx", ".jks", ".keystore", ".mobileprovision", ".key"})
PRIVATE_KEY_NAMES = frozenset({"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"})
SCRIPT_ROOT = Path(__file__).resolve().parents[1]


class InvalidHookInput(ValueError):
    """Input cannot be interpreted safely; never include input in the message."""


def load_event(stream):
    raw = stream.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise InvalidHookInput("Hook input exceeds the supported size.")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        raise InvalidHookInput("Hook input must be a valid JSON object.") from None
    if not isinstance(value, dict):
        raise InvalidHookInput("Hook input must be a JSON object.")
    return value


def deny(reason):
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}


def protected_reason(path):
    """Use path components, not broad substrings like 'approval' or 'secret'."""
    name = path.name.casefold()
    if (name == ".env" or name.startswith(".env.")) and not name.endswith(".example"):
        return "Environment-secret files are outside ordinary agent edits; use dummy example configuration."
    if path.suffix.casefold() in SIGNING_SUFFIXES or name in PRIVATE_KEY_NAMES:
        return "Signing and private-key files belong to the separately authorized credential operator."
    parts = [part.casefold() for part in path.parts]
    if any(parts[i:i + 2] == [".studio", "approvals"] for i in range(len(parts) - 1)):
        return "Stored approval records must change through the authorized approval service, not file edits."
    return None


def edit_path(event):
    tool_input = event.get("tool_input")
    if not isinstance(tool_input, dict):
        raise InvalidHookInput("An edit requires structured tool input.")
    raw = tool_input.get("file_path")
    if not isinstance(raw, str) or not raw.strip() or "\0" in raw or len(raw) > 32768:
        raise InvalidHookInput("An edit requires a valid file path.")
    # Native Path handles the host platform. Foreign separators are rejected on
    # POSIX instead of pretending Windows drive paths resolve on this machine.
    if os.name != "nt" and "\\" in raw:
        raise InvalidHookInput("Use the host platform's unambiguous file path format.")
    path = Path(raw)
    if not path.is_absolute():
        cwd = event.get("cwd")
        if not isinstance(cwd, str) or "\0" in cwd or not Path(cwd).is_absolute():
            raise InvalidHookInput("A relative edit requires an absolute working directory.")
        path = Path(cwd) / path
    try:
        resolved = path.resolve(strict=False)
    except (OSError, RuntimeError, ValueError):
        raise InvalidHookInput("The edit path could not be resolved.") from None
    return path, resolved


def guard_edit(event):
    if event.get("hook_event_name") != "PreToolUse":
        raise InvalidHookInput("The configured edit hook requires a PreToolUse event.")
    tool_name = event.get("tool_name")
    if not isinstance(tool_name, str):
        raise InvalidHookInput("The edit hook requires a valid tool name.")
    if tool_name not in EDIT_TOOLS:
        return None
    original, resolved = edit_path(event)
    # Check both spellings: a protected filename symlinked elsewhere still needs
    # protection, as does an innocent-looking alias pointing at a protected file.
    lexical = Path(os.path.normpath(str(original)))
    reason = protected_reason(lexical) or protected_reason(resolved)
    return deny(reason) if reason else None


def session_start(event):
    if event.get("hook_event_name") != "SessionStart":
        raise InvalidHookInput("The configured reminder requires a SessionStart event.")
    present = all((SCRIPT_ROOT / name).is_file() for name in (
        "CLAUDE.md", "agents/COMMON.md", "agents/registry.json"))
    context = (
        "SaneGames session: read CLAUDE.md, agents/COMMON.md and your complete role prom.md. "
        "Use the current task and its checkpoint; verify source state before resuming. "
        "If no checkpoint is assigned, establish the task record using templates/agents/. "
        "Skills route into those contracts; generated .claude/agents wrappers are not the canonical prompts. "
        "Plan, use Claude Design for visual work when available, implement, and gather independent evidence. "
        "Use only included subscription resources; preserve private evidence and the owner-only release gate. "
        "This reminder saved no checkpoint, started no agent, and verified no product capability."
    )
    if not present:
        context += " The hook's source tree lacks a core contract; resolve the pinned studio reference before role work."
    return {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}


def main(argv=None, stream=None, output=None, errors=None):
    argv = sys.argv[1:] if argv is None else argv
    stream = sys.stdin.buffer if stream is None else stream
    output = sys.stdout if output is None else output
    errors = sys.stderr if errors is None else errors
    if argv not in (["session-start"], ["guard-edit"]):
        print("Usage: agent_hooks.py session-start|guard-edit", file=errors)
        return 1
    mode = argv[0]
    try:
        event = load_event(stream)
        result = guard_edit(event) if mode == "guard-edit" else session_start(event)
    except InvalidHookInput as exc:
        if mode == "guard-edit":
            result = deny(str(exc))
        else:
            # An unavailable reminder must not stop a session or invent context.
            print("SaneGames session reminder unavailable: invalid hook metadata.", file=errors)
            return 0
    if result is not None:
        print(json.dumps(result, ensure_ascii=True), file=output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
