#!/usr/bin/env python3
"""Validate SaneGames Claude skill contracts and operational worker profiles."""
from __future__ import annotations
import json, pathlib, re, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
errors=[]

def err(msg): errors.append(msg)

registry=json.loads((ROOT/"agents/registry.json").read_text())
roles={r["id"] for r in registry["roles"]}
profiles=json.loads((ROOT/"config/worker-profiles.json").read_text())["profiles"]
example=json.loads((ROOT/"config/worker.example.json").read_text())
allowed=example.get("allowed_tools",{})

for name,p in profiles.items():
    caps=p.get("capabilities",[])
    unknown=sorted(set(caps)-roles)
    if unknown: err(f"{name}: unknown capabilities: {unknown}")
    missing=sorted(set(caps)-set(allowed))
    if missing: err(f"{name}: capabilities without allowed_tools: {missing}")
    if name!="mac-3-integration" and p.get("allow_integration"):
        err(f"{name}: only mac-3-integration may enable integration")
if not profiles.get("mac-3-integration",{}).get("allow_integration"):
    err("mac-3-integration must enable integration")

skill_files=sorted((ROOT/".claude/skills").glob("*/SKILL.md"))
if not skill_files: err("no Claude skills found")
names={}
for path in skill_files:
    text=path.read_text()
    if not text.startswith("---\n"):
        err(f"{path.relative_to(ROOT)}: missing frontmatter")
        continue
    parts=text.split("---",2)
    front=parts[1]
    body=parts[2] if len(parts)>2 else ""
    m=re.search(r"(?m)^name:\s*([a-z0-9-]+)\s*$",front)
    d=re.search(r"(?m)^description:\s*(.+)$",front)
    if not m: err(f"{path.relative_to(ROOT)}: missing/invalid name"); continue
    name=m.group(1)
    if name in names: err(f"duplicate skill name {name}")
    names[name]=path
    if path.parent.name!=name: err(f"{path.relative_to(ROOT)}: folder/name mismatch")
    if not d or len(d.group(1).strip())<20: err(f"{name}: description too short/missing")
    if len(body.strip())<500: err(f"{name}: skill body unexpectedly short")

# Slash references between project-local skills must resolve.
for name,path in names.items():
    text=path.read_text()
    for target in re.findall(r"(?<![\w.-])/([a-z][a-z0-9-]+)",text):
        if target in {"Users"}: continue
        if target not in names and target.startswith(("studio-","game-","release-","claude-","reference-","opportunity-")):
            err(f"{name}: unresolved project skill reference /{target}")

required={"studio-plan","claude-design-handoff","game-implementation","release-evidence",
          "reference-intelligence","opportunity-entrepreneur"}
missing=sorted(required-set(names))
if missing: err(f"required skills missing: {missing}")

prom=(ROOT/"prom.md").read_text()
for skill in ("reference-intelligence","opportunity-entrepreneur","studio-plan","game-implementation","release-evidence"):
    if f"/{skill}" not in prom:
        err(f"prom.md does not wire /{skill}")

for rel in ("templates/research/reference-features.csv","templates/research/improvement-backlog.csv",
            "docs/REFERENCE_INTELLIGENCE.md","docs/ENTREPRENEUR_WORKFLOW.md","docs/OPERATIONAL_ACCEPTANCE.md"):
    if not (ROOT/rel).is_file(): err(f"missing supporting artifact: {rel}")

if errors:
    print("Skill/profile validation failed:")
    for e in errors: print(f"- {e}")
    raise SystemExit(1)
print(f"Skill/profile validation passed: {len(names)} skills, {len(roles)} roles, {len(profiles)} worker profiles.")
