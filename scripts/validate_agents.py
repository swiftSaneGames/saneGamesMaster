#!/usr/bin/env python3
"""Validate prompt coverage, organizational topology and generated Claude entrypoints."""
import json
import re
from pathlib import Path
from sync_agent_definitions import definitions

ROOT = Path(__file__).resolve().parents[1]
HEADINGS = (
    'Mission and ownership', 'Required inputs', 'Startup and resume',
    'Execution workflow', 'Deliverables', 'Acceptance criteria',
    'Handoffs and delegation', 'Failure and escalation', 'Boundaries', 'Completion report',
)
DASHBOARD_ROLES = {'researcher', 'designer', 'architect', 'producer', 'developer', 'art-ux', 'qa', 'release', 'liveops'}
ORIGINAL_ROLES = {'studio-researcher', 'studio-designer', 'studio-architect', 'studio-producer',
                  'studio-developer', 'studio-art-ux', 'studio-qa', 'release-preparer',
                  'studio-liveops', 'dashboard-reviewer'}


def validate(root=ROOT):
    errors = []
    registry = json.loads((root / 'agents/registry.json').read_text())
    roles = registry['roles']
    ids = [r['id'] for r in roles]
    by_id = {r['id']: r for r in roles}
    if len(ids) != len(set(ids)):
        errors.append('Duplicate role IDs')
    if not ORIGINAL_ROLES <= set(ids):
        errors.append('An original role is missing')
    if [r['id'] for r in roles if r['parent'] is None] != ['studio-director']:
        errors.append('Expected exactly one organizational root: studio-director')
    for role in roles:
        rid = role['id']
        if not re.fullmatch(r'[a-z][a-z0-9-]*', rid):
            errors.append(f'Invalid role ID: {rid}')
        if role['prompt'] != f'agents/{rid}/prom.md' or role['definition'] != f'.claude/agents/{rid}.md':
            errors.append(f'{rid}: noncanonical path')
        if role['dashboard_role'] not in DASHBOARD_ROLES:
            errors.append(f'{rid}: unsupported dashboard category')
        parent, seen = role['parent'], {rid}
        while parent is not None:
            if parent in seen or parent not in by_id:
                errors.append(f'{rid}: missing parent or organizational cycle at {parent}')
                break
            seen.add(parent)
            parent = by_id[parent]['parent']
        tools = role['tools']
        if len(tools) != len(set(tools)) or 'Read' not in tools:
            errors.append(f'{rid}: duplicate tools or missing Read')
        if ('Agent' in tools) != (rid == 'studio-director'):
            errors.append(f'{rid}: only director should dispatch agents by default')
        prompt = root / role['prompt']
        if not prompt.is_file():
            errors.append(f'Missing {role["prompt"]}')
            continue
        content = prompt.read_text()
        for heading in HEADINGS:
            if f'## {heading}\n' not in content:
                errors.append(f'{rid}: missing section {heading}')
        if len(content.split()) < 550:
            errors.append(f'{rid}: role contract too short for the requested detailed workflow')
        if 'agents/COMMON.md' not in content or 'checkpoint' not in content.lower():
            errors.append(f'{rid}: missing common contract or continuity instructions')
    expected_prompts = {r['prompt'] for r in roles}
    actual_prompts = {str(p.relative_to(root)) for p in (root / 'agents').glob('*/prom.md')}
    if actual_prompts != expected_prompts:
        errors.append('Unregistered or missing canonical role prompt')
    expected = definitions(root)
    actual_definitions = {str(p.relative_to(root)) for p in (root / '.claude/agents').glob('*.md')}
    if actual_definitions != set(expected):
        errors.append('Unregistered or missing runtime agent definition')
    for relative, wanted in expected.items():
        target = root / relative
        if not target.exists() or target.read_text() != wanted:
            errors.append(f'Generated definition drift: {relative}')
    for relative in [registry['entrypoint'], registry['shared_contract'], 'agents/README.md',
                     'templates/agents/task.md', 'templates/agents/checkpoint.md', 'templates/agents/handoff.md',
                     'templates/game/README.md', 'templates/game/CLAUDE.md']:
        if not (root / relative).is_file():
            errors.append(f'Missing required support file: {relative}')
    return errors, len(roles)


if __name__ == '__main__':
    try:
        problems, count = validate()
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Invalid agent registry: {exc}')
        raise SystemExit(1)
    if problems:
        print('\n'.join(problems))
        raise SystemExit(1)
    print(f'PASS: {count} detailed role prompts, generated definitions, parent links, dashboard mappings and continuity templates.')
    print('Static validation only; no Claude workers, physical devices or store publisher were executed.')
