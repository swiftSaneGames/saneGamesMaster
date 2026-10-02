"""Fictional fixtures, never real studio projects or test evidence."""
from datetime import datetime, timedelta, timezone

from .models import Manifest, REQUIRED_GATES
from .store import Store, canonical, digest, now


def demo_manifest(slug: str = "slice-street", blocked: bool = False) -> dict:
    return Manifest(
        project_slug=slug,
        version="1.0.0",
        commit=digest(slug)[:40],
        release_notes="SAMPLE ONLY. Three neighborhood locations, staff upgrades, a complete save loop, and an optional delivery challenge. These features do not represent a built game.",
        artifacts=[
            {"platform": p, "label": f"Sample {p} build", "sha256": digest(slug + p),
             "url": f"https://example.invalid/{slug}/{p}",
             "installation_notes": "Sample reference only. No installable build exists. Live iOS builds require TestFlight or another valid Apple distribution route."}
            for p in ("android", "ios")
        ],
        evidence=[
            {"gate": gate, "status": "fail" if blocked and gate == "save_migration" else "pass",
             "summary": "SAMPLE: migration fixture failed; reset after upgrade." if blocked and gate == "save_migration" else "SAMPLE: illustrative result only; no actual game or device test ran.",
             "url": f"https://example.invalid/{slug}/evidence/{gate}"}
            for gate in REQUIRED_GATES
        ],
        known_issues=["SAMPLE: progress resets during a save migration."] if blocked else ["SAMPLE ONLY: no real build has been evaluated."],
        blocking_issues=1 if blocked else 0,
        launch_summary="SAMPLE launch pack: store screenshots, a 15-second gameplay clip, and a community playtesting announcement. None has been published.",
    ).model_dump()


def seed(store: Store) -> None:
    projects = [
        ("slice-street", "Slice Street", "Business simulation", "A neighborhood pizza business, one happy customer at a time.", "review", None),
        ("pocket-pitstop", "Pocket Pitstop", "Business simulation", "Fuel, repair, and grow a friendly roadside service station.", "review", None),
        ("cozy-paws", "Cozy Paws", "Business simulation", "A gentle pet-care business with staff and cozy new spaces.", "building", None),
        ("branching-days", "Branching Days", "Decision simulation", "Small everyday decisions build an original life story.", "research", None),
        ("little-market", "Little Market", "Idle management", "A neighborhood shop with a deeper upgrade economy.", "maintenance", 6),
        ("harbor-cafe", "Harbor Cafe", "Business simulation", "Serve the waterfront and expand your tiny cafe.", "maintenance", 18),
    ]
    with store.connect(write=True) as db:
        if db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]:
            return
        for slug, title, category, summary, stage, days in projects:
            due = (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat() if days is not None else None
            last = (datetime.now(timezone.utc) + timedelta(days=days-30)).date().isoformat() if days is not None else None
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)", (slug, title, category, summary, stage, last, due, now()))
        for slug, blocked in [("slice-street", False), ("pocket-pitstop", True)]:
            manifest = canonical(demo_manifest(slug, blocked))
            h = digest(manifest)
            rid = "demo-" + slug
            db.execute("INSERT INTO releases(id,project_slug,version,manifest_json,manifest_hash,status,created_at) VALUES(?,?,?,?,?,'awaiting_review',?)", (rid, slug, "1.0.0", manifest, h, now()))
            store.audit(db, "demo_candidate_created", "fixture", rid, {"sample_only": True, "manifest_hash": h})
        store.audit(db, "demo_initialized", "system", "studio", {"sample_only": True})
