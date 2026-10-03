#!/usr/bin/env python3
"""Validate the checked-in research catalog without making network requests.

This verifies data integrity, not live store availability, market ranking, or
hands-on suitability. Run a fresh listing review before greenlighting a game.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlparse

COLUMNS = [
    "game_id", "title", "developer", "package_id", "play_url", "category",
    "studio_fit", "complexity", "competitive_mode", "source_url",
    "verification_status", "verified_at", "ranking_status", "notes",
]
CATEGORIES = {
    "Adventure", "Arcade", "Board & Card", "Casual", "Educational",
    "Music & Rhythm", "Puzzle", "Simulation", "Strategy",
}
EXCLUDED_TITLES = re.compile(
    r"\b(free\s*fire|pubg|battlegrounds|call of duty|modern combat|sniper|"
    r"counter.strike|standoff|fortnite|shooter|fps|casino|poker|blackjack)\b", re.I
)
PACKAGE = re.compile(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+\Z")


def check(path: Path, expected: int = 500) -> tuple[list[str], list[dict[str, str]]]:
    errors: list[str] = []
    try:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != COLUMNS:
                errors.append(f"Column order/schema differs: {reader.fieldnames!r}")
            rows = list(reader)
    except (OSError, csv.Error) as exc:
        return [f"Cannot read {path}: {exc}"], []
    if len(rows) != expected:
        errors.append(f"Expected {expected} rows; found {len(rows)}")
    for field in ("game_id", "package_id", "play_url"):
        counts = collections.Counter(row.get(field, "") for row in rows)
        errors.extend(f"Duplicate {field}: {value}" for value, n in counts.items() if n > 1)
    for line, row in enumerate(rows, 2):
        prefix = f"line {line}: "
        for field in COLUMNS:
            if not row.get(field, "").strip():
                errors.append(prefix + f"missing {field}")
        if None in row:
            errors.append(prefix + "unexpected extra CSV columns")
        pid = row.get("package_id", "")
        if not PACKAGE.fullmatch(pid):
            errors.append(prefix + "invalid package_id format")
        if not re.fullmatch(r"REF-\d{4}", row.get("game_id", "")):
            errors.append(prefix + "invalid game_id format")
        for field in ("play_url", "source_url"):
            parsed = urlparse(row.get(field, ""))
            if (parsed.scheme != "https" or parsed.netloc != "play.google.com"
                    or parsed.path != "/store/apps/details"
                    or parse_qs(parsed.query).get("id") != [pid]):
                errors.append(prefix + f"{field} is not a matching official Play listing")
        if row.get("category") not in CATEGORIES:
            errors.append(prefix + "category outside studio research taxonomy")
        if row.get("studio_fit") != "candidate_requires_playtest":
            errors.append(prefix + "studio_fit must preserve the playtest limitation")
        if row.get("complexity") not in {"small_loop_estimate", "vertical_slice_estimate"}:
            errors.append(prefix + "unknown complexity estimate")
        if row.get("competitive_mode") != "not_established_from_listing":
            errors.append(prefix + "competitive_mode overstates untested gameplay")
        if row.get("verification_status") != "direct_play_listing_verified":
            errors.append(prefix + "unverified listing identity")
        if row.get("ranking_status") != "unranked_reference":
            errors.append(prefix + "unsupported ranking claim")
        try:
            timestamp = dt.datetime.fromisoformat(row.get("verified_at", ""))
            if timestamp.tzinfo is None:
                errors.append(prefix + "verified_at must include timezone")
        except ValueError:
            errors.append(prefix + "invalid ISO verified_at timestamp")
        if EXCLUDED_TITLES.search(row.get("title", "")):
            errors.append(prefix + "excluded shooter/competitive/casino title")
        if "Not playtested" not in row.get("notes", ""):
            errors.append(prefix + "notes must disclose lack of hands-on verification")
    return errors, rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path,
                        default=Path(__file__).resolve().parents[1] / "research/games_500.csv")
    parser.add_argument("--expected", type=int, default=500)
    args = parser.parse_args()
    errors, rows = check(args.path, args.expected)
    if errors:
        print("Catalog validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    counts = collections.Counter(row["category"] for row in rows)
    print(f"PASS: {len(rows)} unique, source-linked game identities; no rankings asserted.")
    for category, count in sorted(counts.items()):
        print(f"  {category}: {count}")
    print("Scope: structural integrity only. Gameplay suitability still requires playtesting.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
