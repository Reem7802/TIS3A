"""
تسعة — Database Layer
======================
SQLite — single file on disk, zero setup, proper queries for analytics.

Run once to create the table:
    python -m core.database

Or it auto-creates on first import via init_db().
"""

import sqlite3
import json
import os
import time
from contextlib import contextmanager
from typing import Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH  = os.path.join(BASE_DIR, "tis3a.db")


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS calls (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_number       TEXT UNIQUE,
                created_at          REAL,
                channel             TEXT,        -- 'voice' or 'text'
                transcript          TEXT,        -- full conversation transcript (all turns)
                customer_text       TEXT,        -- first message only (for word cloud)
                intent              TEXT,
                intent_confidence   REAL,
                intent_scores       TEXT,        -- JSON
                emotion             TEXT,
                emotion_confidence  REAL,
                emotion_scores      TEXT,        -- JSON
                priority            TEXT,
                emotion_boosted     INTEGER,
                proposed_action     TEXT,
                customer_decision   TEXT,        -- 'yes' / 'no' / null (not reached yet)
                actions_taken       TEXT,        -- JSON list
                status              TEXT,        -- 'resolved' / 'open' / 'in_progress'
                agent_note          TEXT,
                audio_path          TEXT,        -- path to recorded audio file, nullable
                questions_asked     TEXT,        -- JSON list
                answers_collected   TEXT         -- JSON list
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON calls(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_status ON calls(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_intent ON calls(intent)")


def save_call(data: dict) -> int:
    """Insert a new call record. Returns the row id."""
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO calls (
                ticket_number, created_at, channel, transcript, customer_text,
                intent, intent_confidence, intent_scores,
                emotion, emotion_confidence, emotion_scores,
                priority, emotion_boosted, proposed_action, customer_decision,
                actions_taken, status, agent_note, audio_path,
                questions_asked, answers_collected
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data.get("ticket_number"),
            data.get("created_at", time.time()),
            data.get("channel", "voice"),
            data.get("transcript", ""),
            data.get("customer_text", ""),
            data.get("intent", ""),
            data.get("intent_confidence", 0.0),
            json.dumps(data.get("intent_scores", {}), ensure_ascii=False),
            data.get("emotion", ""),
            data.get("emotion_confidence", 0.0),
            json.dumps(data.get("emotion_scores", {}), ensure_ascii=False),
            data.get("priority", "LOW"),
            int(data.get("emotion_boosted", False)),
            data.get("proposed_action", ""),
            data.get("customer_decision"),
            json.dumps(data.get("actions_taken", []), ensure_ascii=False),
            data.get("status", "open"),
            data.get("agent_note", ""),
            data.get("audio_path"),
            json.dumps(data.get("questions_asked", []), ensure_ascii=False),
            json.dumps(data.get("answers_collected", []), ensure_ascii=False),
        ))
        return cur.lastrowid


def update_call_status(ticket_number: str, status: str, customer_decision: Optional[str] = None):
    with get_conn() as conn:
        if customer_decision is not None:
            conn.execute(
                "UPDATE calls SET status = ?, customer_decision = ? WHERE ticket_number = ?",
                (status, customer_decision, ticket_number)
            )
        else:
            conn.execute(
                "UPDATE calls SET status = ? WHERE ticket_number = ?",
                (status, ticket_number)
            )


def get_call(ticket_number: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM calls WHERE ticket_number = ?", (ticket_number,)).fetchone()
        return _row_to_dict(row) if row else None


def list_calls(limit: int = 100, offset: int = 0, status: Optional[str] = None) -> list[dict]:
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM calls WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (status, limit, offset)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM calls ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_today_stats() -> dict:
    """Stats for the 4 top boxes on the dashboard."""
    start_of_day = time.time() - (time.time() % 86400)
    with get_conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) as c FROM calls WHERE created_at >= ?", (start_of_day,)
        ).fetchone()["c"]

        fraud = conn.execute(
            "SELECT COUNT(*) as c FROM calls WHERE created_at >= ? AND intent = 'fraud'", (start_of_day,)
        ).fetchone()["c"]

        critical = conn.execute(
            "SELECT COUNT(*) as c FROM calls WHERE created_at >= ? AND priority = 'CRITICAL'", (start_of_day,)
        ).fetchone()["c"]

        open_count = conn.execute(
            "SELECT COUNT(*) as c FROM calls WHERE created_at >= ? AND status = 'open'", (start_of_day,)
        ).fetchone()["c"]

        return {
            "total_today":    total,
            "fraud_today":    fraud,
            "critical_today": critical,
            "open_today":     open_count,
        }


def get_intent_distribution() -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT intent, COUNT(*) as c FROM calls GROUP BY intent ORDER BY c DESC"
        ).fetchall()
        return {r["intent"]: r["c"] for r in rows}


def get_emotion_distribution() -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT emotion, COUNT(*) as c FROM calls GROUP BY emotion ORDER BY c DESC"
        ).fetchall()
        return {r["emotion"]: r["c"] for r in rows}


def get_daily_counts(days: int = 7) -> list[dict]:
    cutoff = time.time() - days * 86400
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT created_at FROM calls WHERE created_at >= ?", (cutoff,)
        ).fetchall()
        buckets: dict[str, int] = {}
        for r in rows:
            day = time.strftime("%Y-%m-%d", time.localtime(r["created_at"]))
            buckets[day] = buckets.get(day, 0) + 1
        return [{"date": k, "count": v} for k, v in sorted(buckets.items())]


def get_all_customer_texts() -> list[str]:
    """For word cloud generation."""
    with get_conn() as conn:
        rows = conn.execute("SELECT customer_text FROM calls WHERE customer_text != ''").fetchall()
        return [r["customer_text"] for r in rows]


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for json_field in ["intent_scores", "emotion_scores", "actions_taken", "questions_asked", "answers_collected"]:
        if d.get(json_field):
            try:
                d[json_field] = json.loads(d[json_field])
            except (json.JSONDecodeError, TypeError):
                d[json_field] = [] if json_field != "intent_scores" and json_field != "emotion_scores" else {}
    return d


if __name__ == "__main__":
    init_db()
    print(f"✓ Database initialized at {DB_PATH}")
