#!/usr/bin/env python3
"""Create a consistent SQLite snapshot. Store it on an encrypted, private volume."""
import argparse
import os
import sqlite3
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-dir', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    args=p.parse_args()
    source=(args.data_dir/'studio.sqlite3').resolve()
    output=args.output.resolve()
    if not source.is_file(): p.error('The source database does not exist')
    if output.exists(): p.error('Refusing to overwrite an existing backup')
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.umask(0o077)
    with sqlite3.connect(f'file:{source}?mode=ro', uri=True) as src, sqlite3.connect(output) as dest:
        src.backup(dest)
        result=dest.execute('PRAGMA integrity_check').fetchone()[0]
        if result!='ok': raise RuntimeError('Backup integrity check failed')
        # Do not carry active browser sessions or OAuth state into backups.
        dest.execute('DELETE FROM sessions')
        dest.execute('DELETE FROM oauth_states')
        dest.commit()
    print('Private database backup created and checked.')


if __name__=='__main__': main()
