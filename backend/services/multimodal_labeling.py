"""Persistent job helpers for multimodal auto-labeling demo."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.config import LOG_DIR


LABELING_DB_PATH = Path(LOG_DIR) / "multimodal_labeling.db"


def init_multimodal_labeling_db() -> None:
    LABELING_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(LABELING_DB_PATH))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS multimodal_labeling_jobs (
                job_id TEXT PRIMARY KEY,
                dataset_name TEXT NOT NULL,
                scope_type TEXT NOT NULL,
                status TEXT NOT NULL,
                strategy TEXT NOT NULL,
                config_json TEXT NOT NULL,
                stats_json TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_multimodal_labeling_jobs_created_at "
            "ON multimodal_labeling_jobs(created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_multimodal_labeling_jobs_dataset_name "
            "ON multimodal_labeling_jobs(dataset_name)"
        )
        conn.commit()
    finally:
        conn.close()


def create_labeling_job_id() -> str:
    return f"mlj_{uuid.uuid4().hex[:16]}"


def save_multimodal_labeling_job(
    *,
    job_id: str,
    dataset_name: str,
    scope_type: str,
    status: str,
    strategy: str,
    config: Dict[str, Any],
    stats: Dict[str, Any],
    result: Dict[str, Any],
) -> None:
    init_multimodal_labeling_db()
    conn = sqlite3.connect(str(LABELING_DB_PATH))
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO multimodal_labeling_jobs (
                job_id, dataset_name, scope_type, status, strategy,
                config_json, stats_json, result_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                dataset_name,
                scope_type,
                status,
                strategy,
                json.dumps(config, ensure_ascii=False),
                json.dumps(stats, ensure_ascii=False),
                json.dumps(result, ensure_ascii=False),
                datetime.now().isoformat(sep=" ", timespec="seconds"),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def update_multimodal_labeling_job(
    job_id: str,
    *,
    status: Optional[str] = None,
    stats: Optional[Dict[str, Any]] = None,
    result: Optional[Dict[str, Any]] = None,
) -> None:
    init_multimodal_labeling_db()
    conn = sqlite3.connect(str(LABELING_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT status, stats_json, result_json
            FROM multimodal_labeling_jobs
            WHERE job_id = ?
            """,
            (job_id,),
        ).fetchone()
        if not row:
            raise KeyError(f"labeling job not found: {job_id}")

        next_status = status or row["status"]
        next_stats = stats if stats is not None else json.loads(row["stats_json"] or "{}")
        next_result = result if result is not None else json.loads(row["result_json"] or "{}")

        conn.execute(
            """
            UPDATE multimodal_labeling_jobs
            SET status = ?, stats_json = ?, result_json = ?, created_at = ?
            WHERE job_id = ?
            """,
            (
                next_status,
                json.dumps(next_stats, ensure_ascii=False),
                json.dumps(next_result, ensure_ascii=False),
                datetime.now().isoformat(sep=" ", timespec="seconds"),
                job_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def list_multimodal_labeling_jobs(limit: int = 20, dataset_name: str = "") -> List[Dict[str, Any]]:
    init_multimodal_labeling_db()
    conn = sqlite3.connect(str(LABELING_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        if dataset_name:
            rows = conn.execute(
                """
                SELECT job_id, dataset_name, scope_type, status, strategy, stats_json, created_at
                FROM multimodal_labeling_jobs
                WHERE dataset_name = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (dataset_name, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT job_id, dataset_name, scope_type, status, strategy, stats_json, created_at
                FROM multimodal_labeling_jobs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        items = []
        for row in rows:
            stats = json.loads(row["stats_json"] or "{}")
            items.append(
                {
                    "job_id": row["job_id"],
                    "dataset_name": row["dataset_name"],
                    "scope_type": row["scope_type"],
                    "status": row["status"],
                    "strategy": row["strategy"],
                    "created_at": row["created_at"],
                    "record_count": stats.get("record_count", 0),
                    "prediction_count": stats.get("prediction_count", 0),
                    "reviewed_asset_count": stats.get("reviewed_asset_count", 0),
                }
            )
        return items
    finally:
        conn.close()


def get_multimodal_labeling_job(job_id: str) -> Optional[Dict[str, Any]]:
    init_multimodal_labeling_db()
    conn = sqlite3.connect(str(LABELING_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT job_id, dataset_name, scope_type, status, strategy,
                   config_json, stats_json, result_json, created_at
            FROM multimodal_labeling_jobs
            WHERE job_id = ?
            """,
            (job_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "job_id": row["job_id"],
            "dataset_name": row["dataset_name"],
            "scope_type": row["scope_type"],
            "status": row["status"],
            "strategy": row["strategy"],
            "config": json.loads(row["config_json"] or "{}"),
            "stats": json.loads(row["stats_json"] or "{}"),
            "result": json.loads(row["result_json"] or "{}"),
            "created_at": row["created_at"],
        }
    finally:
        conn.close()
