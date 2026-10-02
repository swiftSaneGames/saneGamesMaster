from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class Store:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(data_dir, 0o700)
        self.path = data_dir / "studio.sqlite3"
        with self.connect() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS projects(
                slug TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
                summary TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'research',
                last_release_at TEXT, next_update_at TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS releases(
                id TEXT PRIMARY KEY, project_slug TEXT NOT NULL REFERENCES projects(slug),
                version TEXT NOT NULL, manifest_json TEXT NOT NULL,
                manifest_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
                created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, decision_note TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions(
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL,
                csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS oauth_states(
                state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit(
                seq INTEGER PRIMARY KEY AUTOINCREMENT, event_json TEXT NOT NULL,
                previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL
            );
            CREATE TRIGGER IF NOT EXISTS immutable_manifest
            BEFORE UPDATE OF manifest_json, manifest_hash, project_slug, version ON releases
            BEGIN SELECT RAISE(ABORT, 'Release manifests are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS no_release_delete
            BEFORE DELETE ON releases BEGIN SELECT RAISE(ABORT, 'Release records cannot be deleted'); END;
            CREATE TRIGGER IF NOT EXISTS no_audit_update
            BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;
            CREATE TRIGGER IF NOT EXISTS no_audit_delete
            BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;
            """)
        os.chmod(self.path, 0o600)

    @contextmanager
    def connect(self, write: bool = False) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def bind_mode(self, mode: str) -> None:
        with self.connect(write=True) as db:
            row = db.execute("SELECT value FROM metadata WHERE key='mode'").fetchone()
            if row and row["value"] != mode:
                raise ValueError("A demo database must never become a production database")
            db.execute("INSERT OR IGNORE INTO metadata VALUES('mode',?)", (mode,))

    @staticmethod
    def audit(db: sqlite3.Connection, action: str, actor: str, subject: str, detail: dict | None = None) -> None:
        last = db.execute("SELECT event_hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        previous = last["event_hash"] if last else "0" * 64
        event = canonical({"time": now(), "action": action, "actor": actor, "subject": subject, "detail": detail or {}})
        db.execute("INSERT INTO audit(event_json,previous_hash,event_hash) VALUES(?,?,?)", (event, previous, digest(previous + event)))

    def audit_chain_valid(self) -> bool:
        previous = "0" * 64
        with self.connect() as db:
            for row in db.execute("SELECT * FROM audit ORDER BY seq"):
                if row["previous_hash"] != previous or row["event_hash"] != digest(previous + row["event_json"]):
                    return False
                previous = row["event_hash"]
        return True
