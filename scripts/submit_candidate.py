#!/usr/bin/env python3
"""Submit a candidate manifest only. This credential cannot approve or publish it."""
import argparse
import json
import os
import sys
from urllib.parse import urlsplit
import httpx


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', help='Path to a private release manifest JSON file')
    parser.add_argument('--base-url', default=os.getenv('BASE_URL','https://prod.sanegames.swiftsane.com'))
    args=parser.parse_args()
    if urlsplit(args.base_url).scheme != 'https':
        parser.error('Intake credentials must only be transmitted over HTTPS')
    token=os.getenv('INTAKE_TOKEN')
    if not token:
        parser.error('Set INTAKE_TOKEN through a local secret mechanism; never paste it into chat or Git')
    try:
        with open(args.manifest, encoding='utf-8') as f:
            manifest=json.load(f)
        response=httpx.post(args.base_url.rstrip('/')+'/api/intake/releases', json=manifest,
                            headers={'Authorization':'Bearer '+token}, timeout=30, follow_redirects=False)
        if response.is_error:
            print(f'Intake failed ({response.status_code}): {response.text[:500]}', file=sys.stderr)
            return 1
        print(json.dumps(response.json(), indent=2))
        return 0
    except (OSError, ValueError, httpx.HTTPError) as exc:
        print(f'Could not submit candidate: {type(exc).__name__}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
