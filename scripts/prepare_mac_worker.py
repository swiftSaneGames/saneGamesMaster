#!/usr/bin/env python3
"""Prepare a private SaneGames worker config on macOS without storing secrets in Git.

This script only prepares local directories/configuration. It does not authenticate
Claude/GitHub, create Cloudflare secrets, claim jobs, or enable paid usage.
"""
from __future__ import annotations
import argparse, json, os, pathlib, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROFILES = ROOT / "config" / "worker-profiles.json"
EXAMPLE = ROOT / "config" / "worker.example.json"

def fail(msg: str) -> None:
    raise SystemExit(f"ERROR: {msg}")

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument("--profile",required=True,choices=["mac-1-build","mac-2-qa","mac-3-integration"])
    p.add_argument("--master-root",default=str(ROOT))
    p.add_argument("--private-root",default=str(pathlib.Path.home()/"Library/Application Support/SaneGames"))
    p.add_argument("--repositories-root",default=str(pathlib.Path.home()/"SaneGames/private-games"))
    p.add_argument("--artifact-root")
    p.add_argument("--output")
    args=p.parse_args()

    if sys.platform != "darwin":
        fail("This setup helper is intentionally macOS-only.")
    master=pathlib.Path(args.master_root).expanduser().resolve()
    if not (master/"CLAUDE.md").is_file() or not (master/"scripts/studio_worker.py").is_file():
        fail("master-root is not a SaneGames master checkout.")
    private=pathlib.Path(args.private_root).expanduser().resolve()
    repos=pathlib.Path(args.repositories_root).expanduser().resolve()
    artifacts=pathlib.Path(args.artifact_root).expanduser().resolve() if args.artifact_root else private/"private-artifacts"
    output=pathlib.Path(args.output).expanduser().resolve() if args.output else private/f"{args.profile}.json"

    profile_data=json.loads(PROFILES.read_text())["profiles"][args.profile]
    config=json.loads(EXAMPLE.read_text())
    config["worker_name"]=args.profile
    config["master_root"]=str(master)
    config["repositories"]={"https://github.com/swiftSaneGames/saneGamesMaster":str(master)}
    config["state_root"]=str(private/args.profile)
    config["artifact_root"]=str(artifacts)
    config["capabilities"]=profile_data["capabilities"]
    config["allow_integration"]=bool(profile_data["allow_integration"])
    config["auto_checkout_private_org"]="swiftSaneGames"
    config["repositories_root"]=str(repos)
    config["included_plan_verified"]=False
    config["permissions_verified"]=False
    config["model_verified_cli_version"]=None

    # Keep only permission entries relevant to this profile. Roles absent from the
    # example intentionally receive no unattended permission until explicitly reviewed.
    allowed=config.get("allowed_tools",{})
    config["allowed_tools"]={k:v for k,v in allowed.items() if k in config["capabilities"]}

    for d in (private, repos, artifacts, pathlib.Path(config["state_root"])):
        d.mkdir(parents=True,exist_ok=True)
        os.chmod(d,0o700)
    if output.exists():
        fail(f"refusing to overwrite existing private config: {output}")
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(config,indent=2)+"\n")
    os.chmod(output,0o600)

    print(json.dumps({
      "prepared":True,
      "profile":args.profile,
      "config":str(output),
      "secret_stored":False,
      "included_plan_verified":False,
      "permissions_verified":False,
      "next":[
        "Authenticate Claude Code and Git/GitHub under this dedicated macOS account.",
        "Configure this worker's unique STUDIO_WORKER_TOKEN through a private secret mechanism.",
        f"Run: python3 {master/'scripts/studio_worker.py'} --config {output} --doctor",
        "After doctor passes, execute one bounded job with --execute --once."
      ]
    },indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
