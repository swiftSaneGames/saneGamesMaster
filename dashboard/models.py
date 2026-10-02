from __future__ import annotations

from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=64)]
Hash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Gate = Literal["automated_tests", "android_device", "ios_device", "save_migration", "performance", "privacy_ads", "license_review", "launch_materials"]
REQUIRED_GATES = ("automated_tests", "android_device", "ios_device", "save_migration", "performance", "privacy_ads", "license_review", "launch_materials")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProjectInput(StrictModel):
    slug: Slug
    title: str = Field(min_length=3, max_length=80)
    category: Literal["Business simulation", "Idle management", "Decision simulation", "Puzzle", "Arcade"]
    summary: str = Field(min_length=10, max_length=500)


class Artifact(StrictModel):
    platform: Literal["android", "ios"]
    label: str = Field(min_length=3, max_length=100)
    sha256: Hash
    url: str = Field(min_length=8, max_length=1024)
    installation_notes: str = Field(min_length=10, max_length=1000)


class Evidence(StrictModel):
    gate: Gate
    status: Literal["pass", "fail", "pending"]
    summary: str = Field(min_length=10, max_length=1000)
    url: str = Field(min_length=8, max_length=1024)


class Manifest(StrictModel):
    project_slug: Slug
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$", max_length=40)
    commit: str = Field(pattern=r"^[a-f0-9]{40}$")
    release_notes: str = Field(min_length=20, max_length=4000)
    artifacts: list[Artifact] = Field(min_length=2, max_length=2)
    evidence: list[Evidence] = Field(min_length=8, max_length=8)
    known_issues: list[str] = Field(default_factory=list, max_length=30)
    blocking_issues: int = Field(default=0, ge=0, le=1000)
    launch_summary: str = Field(min_length=20, max_length=2000)

    @model_validator(mode="after")
    def complete_platforms_and_gates(self):
        if {x.platform for x in self.artifacts} != {"android", "ios"}:
            raise ValueError("Exactly one Android and one iOS artifact are required")
        if len({x.gate for x in self.evidence}) != len(REQUIRED_GATES):
            raise ValueError("Each required QA gate must appear exactly once")
        if any(len(x) > 1000 for x in self.known_issues):
            raise ValueError("Known issues are limited to 1000 characters each")
        return self


class Decision(StrictModel):
    manifest_hash: Hash
    action: Literal["approve", "request_changes"]
    confirmation: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=2000)
    attest_playtested_both: bool = False
    attest_reviewed_evidence: bool = False
