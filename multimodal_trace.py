# -*- coding: utf-8 -*-
"""Persistent query trace helpers for multimodal copilot."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from config import LOG_DIR

TRACE_DB_PATH = Path(LOG_DIR) / "multimodal_traces.db"


def init_multimodal_trace_db() -> None:
    TRACE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(TRACE_DB_PATH))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS multimodal_query_traces (
                trace_id TEXT PRIMARY KEY,
                session_id TEXT,
                dataset_name TEXT,
                question TEXT NOT NULL,
                route TEXT,
                intent TEXT,
                filters_json TEXT,
                sql_text TEXT,
                sql_params_json TEXT,
                result_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'success',
                tool_summary TEXT,
                summary_text TEXT,
                steps_json TEXT,
                context_json TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_multimodal_traces_created_at ON multimodal_query_traces(created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_multimodal_traces_session_id ON multimodal_query_traces(session_id)"
        )
        conn.commit()
    finally:
        conn.close()


def create_trace_id() -> str:
    return uuid4().hex


def save_multimodal_query_trace(
    *,
    trace_id: str,
    question: str,
    dataset_name: str,
    route: str,
    intent: str,
    filters: Dict[str, Any],
    sql_text: str,
    sql_params: List[Any],
    result_count: int,
    status: str,
    tool_summary: str,
    summary_text: str,
    steps: List[Dict[str, Any]],
    context: Dict[str, Any],
    session_id: str = "",
) -> None:
    init_multimodal_trace_db()
    created_at = datetime.now().isoformat(sep=" ", timespec="seconds")
    conn = sqlite3.connect(str(TRACE_DB_PATH))
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO multimodal_query_traces (
                trace_id, session_id, dataset_name, question, route, intent, filters_json,
                sql_text, sql_params_json, result_count, status, tool_summary,
                summary_text, steps_json, context_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trace_id,
                session_id,
                dataset_name,
                question,
                route,
                intent,
                json.dumps(filters, ensure_ascii=False),
                sql_text,
                json.dumps(sql_params, ensure_ascii=False),
                result_count,
                status,
                tool_summary,
                summary_text,
                json.dumps(steps, ensure_ascii=False),
                json.dumps(context, ensure_ascii=False),
                created_at,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def list_multimodal_query_traces(limit: int = 20, session_id: str = "") -> List[Dict[str, Any]]:
    init_multimodal_trace_db()
    conn = sqlite3.connect(str(TRACE_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        params: List[Any] = []
        where = ""
        if session_id:
            where = "WHERE session_id = ?"
            params.append(session_id)
        params.append(limit)
        rows = conn.execute(
            f"""
            SELECT trace_id, session_id, dataset_name, question, route, intent,
                   filters_json, result_count, status, tool_summary, summary_text, created_at
            FROM multimodal_query_traces
            {where}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
        items: List[Dict[str, Any]] = []
        for row in rows:
            items.append(
                {
                    "trace_id": row["trace_id"],
                    "session_id": row["session_id"] or "",
                    "dataset_name": row["dataset_name"] or "",
                    "question": row["question"] or "",
                    "route": row["route"] or "",
                    "intent": row["intent"] or "",
                    "filters": json.loads(row["filters_json"] or "{}"),
                    "result_count": int(row["result_count"] or 0),
                    "status": row["status"] or "success",
                    "tool_summary": row["tool_summary"] or "",
                    "summary": row["summary_text"] or "",
                    "created_at": row["created_at"] or "",
                }
            )
        return items
    finally:
        conn.close()


def get_multimodal_query_trace(trace_id: str) -> Optional[Dict[str, Any]]:
    init_multimodal_trace_db()
    conn = sqlite3.connect(str(TRACE_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT *
            FROM multimodal_query_traces
            WHERE trace_id = ?
            """,
            (trace_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "trace_id": row["trace_id"],
            "session_id": row["session_id"] or "",
            "dataset_name": row["dataset_name"] or "",
            "question": row["question"] or "",
            "route": row["route"] or "",
            "intent": row["intent"] or "",
            "filters": json.loads(row["filters_json"] or "{}"),
            "sql": row["sql_text"] or "",
            "sql_params": json.loads(row["sql_params_json"] or "[]"),
            "result_count": int(row["result_count"] or 0),
            "status": row["status"] or "success",
            "tool_summary": row["tool_summary"] or "",
            "summary": row["summary_text"] or "",
            "steps": json.loads(row["steps_json"] or "[]"),
            "context": json.loads(row["context_json"] or "{}"),
            "created_at": row["created_at"] or "",
        }
    finally:
        conn.close()


def get_multimodal_trace_stats() -> Dict[str, Any]:
    init_multimodal_trace_db()
    conn = sqlite3.connect(str(TRACE_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        total = conn.execute("SELECT COUNT(*) AS cnt FROM multimodal_query_traces").fetchone()["cnt"]
        success = conn.execute(
            "SELECT COUNT(*) AS cnt FROM multimodal_query_traces WHERE status = 'success'"
        ).fetchone()["cnt"]
        latest = conn.execute(
            """
            SELECT route, COUNT(*) AS cnt
            FROM multimodal_query_traces
            GROUP BY route
            ORDER BY cnt DESC
            LIMIT 10
            """
        ).fetchall()
        return {
            "total_queries": int(total or 0),
            "success_count": int(success or 0),
            "error_count": int((total or 0) - (success or 0)),
            "top_routes": [{"route": row["route"] or "", "count": int(row["cnt"] or 0)} for row in latest],
        }
    finally:
        conn.close()
