#!/usr/bin/env python3
"""Validate the source-linked catalog structure, not commercial claims."""
from __future__ import annotations
import csv
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

def read_csv(name: str) -> list[dict[str, str]]:
    with (ROOT / 'research' / name).open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f'{name}: malformed CSV row')
        for value in row.values():
            if value.lstrip().startswith(('=', '+', '-', '@')):
                raise ValueError(f'{name}: possible spreadsheet formula prefix')
    return rows

def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)

def valid_url(value: str) -> bool:
    p = urlparse(value)
    return p.scheme == 'https' and bool(p.netloc) and not p.username and not p.password

def main() -> None:
    studios = read_csv('studios_20.csv')
    games = read_csv('games_100.csv')
    observations = read_csv('download_observations.csv')
    require(len(studios) == 20, 'Expected 20 studios')
    require(Counter(s['group'] for s in studios) == {'primary': 10, 'backup': 10}, 'Expected 10 primary and 10 backup studios')
    studio_by_id = {s['studio_id']: s for s in studios}
    require(len(studio_by_id) == 20, 'Duplicate studio IDs')
    require(len(games) == 100, 'Expected 100 game references')
    require(len({g['game_id'] for g in games}) == 100, 'Duplicate game IDs')
    require(len({g['title'].casefold().strip() for g in games}) == 100, 'Duplicate titles')
    counts = Counter(g['studio_id'] for g in games)
    primary = {s['studio_id'] for s in studios if s['group'] == 'primary'}
    require(set(counts) == primary and all(n == 10 for n in counts.values()), 'Expected 10 games per primary studio')
    for s in studios:
        require(valid_url(s['website']) and valid_url(s['catalog_or_reference_url']), 'Invalid studio URL')
        date.fromisoformat(s['checked_on'])
    for g in games:
        require(valid_url(g['source_url']), f"Invalid source: {g['game_id']}")
        require(g['source_url'] == studio_by_id[g['studio_id']]['catalog_or_reference_url'], 'Catalog source mismatch')
        require(g['catalog_evidence'] in {'official_catalog_listing', 'official_catalog_case_study'}, 'Unknown evidence type')
        require(g['playtest_status'] == 'not_played', 'This baseline must not claim playtests')
        require(g['market_priority'] == 'PENDING_DATA', 'Unverified market priority')
        require(g['downloads_30d'] == '' and g['target_country'] == '', 'Missing demand data must remain blank')
        date.fromisoformat(g['checked_on'])
    ids = {g['game_id'] for g in games}
    require(len(observations) == 2, 'Expected two limited install-band observations')
    for row in observations:
        require(row['game_id'] in ids and valid_url(row['source_url']), 'Observation source or join invalid')
        require(row['period'] == 'lifetime' and int(row['lower_bound']) > 0, 'Unexpected metric interpretation')
    interview = (ROOT / 'docs/REQUIREMENTS_INTERVIEW.md').read_text(encoding='utf-8')
    numbers = re.findall(r'^## (\d{2}) —', interview, flags=re.MULTILINE)
    require(numbers == [f'{n:02d}' for n in range(1, 30)], 'Expected all 29 interview questions')
    print('PASS: 29 interview answers; 20 studios (10+10); 100 unique titles; 10 per primary; 2 install-band observations; explicit unranked/unplayed data.')

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, csv.Error) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
