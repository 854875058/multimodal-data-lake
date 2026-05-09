# -*- coding: utf-8 -*-
"""Storage helpers for multimodal detection assets imported from Tower-Eye."""

import json
import logging
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from config import DB_PATH

logger = logging.getLogger(__name__)


def _ensure_parent() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def _get_conn() -> sqlite3.Connection:
    _ensure_parent()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_multimodal_tables() -> None:
    conn = _get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS multimodal_assets (
              asset_id TEXT PRIMARY KEY,
              dataset_name TEXT NOT NULL,
              media_type TEXT NOT NULL,
              file_path TEXT NOT NULL,
              file_name TEXT,
              sha256 TEXT,
              width INTEGER,
              height INTEGER,
              duration_sec REAL,
              captured_at TEXT,
              lat REAL,
              lon REAL,
              source TEXT,
              created_at TEXT,
              imported_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_mm_assets_dataset ON multimodal_assets(dataset_name);
            CREATE INDEX IF NOT EXISTS idx_mm_assets_media_type ON multimodal_assets(media_type);
            CREATE INDEX IF NOT EXISTS idx_mm_assets_captured_at ON multimodal_assets(captured_at);

            CREATE TABLE IF NOT EXISTS multimodal_events (
              event_id TEXT PRIMARY KEY,
              asset_id TEXT NOT NULL,
              dataset_name TEXT NOT NULL,
              event_type TEXT,
              alarm_level TEXT,
              alarm_source TEXT,
              alarm_time TEXT,
              lat REAL,
              lon REAL,
              region TEXT,
              extra_json TEXT,
              summary TEXT,
              description TEXT,
              address TEXT,
              device_name TEXT,
              confidence_level REAL,
              province_name TEXT,
              city_name TEXT,
              county_name TEXT,
              town_code TEXT,
              town_name TEXT,
              device_code TEXT,
              channel_code TEXT,
              channel_name TEXT,
              warning_order_id TEXT,
              warning_type_id TEXT,
              alarm_body TEXT,
              algorithm_code TEXT,
              algorithm_name TEXT,
              emergency_level TEXT,
              importance_level TEXT,
              order_status TEXT,
              confidence_level_max REAL,
              tenant_name TEXT,
              video_path TEXT,
              img_src_path TEXT,
              img_icon_path TEXT,
              created_at TEXT,
              imported_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_mm_events_asset ON multimodal_events(asset_id);
            CREATE INDEX IF NOT EXISTS idx_mm_events_dataset ON multimodal_events(dataset_name);
            CREATE INDEX IF NOT EXISTS idx_mm_events_type ON multimodal_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_mm_events_alarm_time ON multimodal_events(alarm_time);

            CREATE TABLE IF NOT EXISTS multimodal_detections (
              detection_id TEXT PRIMARY KEY,
              asset_id TEXT NOT NULL,
              dataset_name TEXT NOT NULL,
              model_name TEXT,
              label TEXT,
              confidence REAL,
              bbox_x REAL,
              bbox_y REAL,
              bbox_w REAL,
              bbox_h REAL,
              frame_index INTEGER,
              timestamp_sec REAL,
              created_at TEXT,
              imported_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_mm_detections_asset ON multimodal_detections(asset_id);
            CREATE INDEX IF NOT EXISTS idx_mm_detections_label ON multimodal_detections(label);
            CREATE INDEX IF NOT EXISTS idx_mm_detections_dataset ON multimodal_detections(dataset_name);

            CREATE TABLE IF NOT EXISTS multimodal_annotations (
              annotation_id TEXT PRIMARY KEY,
              asset_id TEXT NOT NULL,
              dataset_name TEXT NOT NULL,
              label TEXT,
              bbox_x REAL,
              bbox_y REAL,
              bbox_w REAL,
              bbox_h REAL,
              origin TEXT,
              reviewer TEXT,
              reviewed_at TEXT,
              created_at TEXT,
              imported_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_mm_annotations_asset ON multimodal_annotations(asset_id);
            CREATE INDEX IF NOT EXISTS idx_mm_annotations_label ON multimodal_annotations(label);
            CREATE INDEX IF NOT EXISTS idx_mm_annotations_dataset ON multimodal_annotations(dataset_name);
            """
        )
        conn.commit()
    finally:
        conn.close()


def _select_table_rows(
    source: sqlite3.Connection,
    table_name: str,
    id_column: str,
    ids: Optional[Sequence[str]] = None,
) -> List[sqlite3.Row]:
    if ids is None:
        return source.execute(f"SELECT * FROM {table_name}").fetchall()
    if not ids:
        return []
    placeholders = ",".join(["?"] * len(ids))
    sql = f"SELECT * FROM {table_name} WHERE {id_column} IN ({placeholders})"
    return source.execute(sql, list(ids)).fetchall()


def import_tower_metadata_db(source_db_path: str, dataset_name: str = "tower_eye", limit: int = 0) -> Dict[str, Any]:
    src_path = Path(source_db_path)
    if not src_path.exists():
        raise FileNotFoundError(f"source db not found: {source_db_path}")

    init_multimodal_tables()
    source = sqlite3.connect(str(src_path))
    source.row_factory = sqlite3.Row
    target = _get_conn()
    try:
      assets_sql = "SELECT * FROM assets ORDER BY created_at DESC"
      if limit and limit > 0:
          assets_sql += f" LIMIT {int(limit)}"
      asset_rows = source.execute(assets_sql).fetchall()
      asset_ids = [str(row["asset_id"]) for row in asset_rows]
      event_rows = _select_table_rows(source, "events", "asset_id", asset_ids)
      detection_rows = _select_table_rows(source, "detections", "asset_id", asset_ids)
      annotation_rows = _select_table_rows(source, "annotations", "asset_id", asset_ids)

      target.executemany(
          """
          INSERT OR REPLACE INTO multimodal_assets (
            asset_id, dataset_name, media_type, file_path, file_name, sha256, width, height,
            duration_sec, captured_at, lat, lon, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
              (
                  str(row["asset_id"]),
                  dataset_name,
                  str(row["media_type"] or ""),
                  str(row["file_path"] or ""),
                  str(row["file_name"] or ""),
                  str(row["sha256"] or ""),
                  row["width"],
                  row["height"],
                  row["duration_sec"],
                  row["captured_at"],
                  row["lat"],
                  row["lon"],
                  str(row["source"] or ""),
                  row["created_at"],
              )
              for row in asset_rows
          ],
      )

      target.executemany(
          """
          INSERT OR REPLACE INTO multimodal_events (
            event_id, asset_id, dataset_name, event_type, alarm_level, alarm_source, alarm_time,
            lat, lon, region, extra_json, summary, description, address, device_name, confidence_level,
            province_name, city_name, county_name, town_code, town_name, device_code, channel_code,
            channel_name, warning_order_id, warning_type_id, alarm_body, algorithm_code, algorithm_name,
            emergency_level, importance_level, order_status, confidence_level_max, tenant_name,
            video_path, img_src_path, img_icon_path, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
              (
                  str(row["event_id"]),
                  str(row["asset_id"] or ""),
                  dataset_name,
                  row["event_type"],
                  row["alarm_level"],
                  row["alarm_source"],
                  row["alarm_time"],
                  row["lat"],
                  row["lon"],
                  row["region"],
                  row["extra_json"],
                  row["summary"],
                  row["description"],
                  row["address"],
                  row["device_name"],
                  row["confidence_level"],
                  row["province_name"],
                  row["city_name"],
                  row["county_name"],
                  row["town_code"],
                  row["town_name"],
                  row["device_code"],
                  row["channel_code"],
                  row["channel_name"],
                  row["warning_order_id"],
                  row["warning_type_id"],
                  row["alarm_body"],
                  row["algorithm_code"],
                  row["algorithm_name"],
                  row["emergency_level"],
                  row["importance_level"],
                  row["order_status"],
                  row["confidence_level_max"],
                  row["tenant_name"],
                  row["video_path"],
                  row["img_src_path"],
                  row["img_icon_path"],
                  row["created_at"],
              )
              for row in event_rows
          ],
      )

      target.executemany(
          """
          INSERT OR REPLACE INTO multimodal_detections (
            detection_id, asset_id, dataset_name, model_name, label, confidence, bbox_x, bbox_y,
            bbox_w, bbox_h, frame_index, timestamp_sec, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
              (
                  str(row["detection_id"]),
                  str(row["asset_id"] or ""),
                  dataset_name,
                  row["model_name"],
                  row["label"],
                  row["confidence"],
                  row["bbox_x"],
                  row["bbox_y"],
                  row["bbox_w"],
                  row["bbox_h"],
                  row["frame_index"],
                  row["timestamp_sec"],
                  row["created_at"],
              )
              for row in detection_rows
          ],
      )

      target.executemany(
          """
          INSERT OR REPLACE INTO multimodal_annotations (
            annotation_id, asset_id, dataset_name, label, bbox_x, bbox_y, bbox_w, bbox_h,
            origin, reviewer, reviewed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
              (
                  str(row["annotation_id"]),
                  str(row["asset_id"] or ""),
                  dataset_name,
                  row["label"],
                  row["bbox_x"],
                  row["bbox_y"],
                  row["bbox_w"],
                  row["bbox_h"],
                  row["origin"],
                  row["reviewer"],
                  row["reviewed_at"],
                  row["created_at"],
              )
              for row in annotation_rows
          ],
      )

      target.commit()

      return {
          "dataset_name": dataset_name,
          "source_db_path": str(src_path),
          "assets": len(asset_rows),
          "events": len(event_rows),
          "detections": len(detection_rows),
          "annotations": len(annotation_rows),
      }
    finally:
      source.close()
      target.close()


def get_multimodal_summary(dataset_name: str = "") -> Dict[str, Any]:
    init_multimodal_tables()
    conn = _get_conn()
    try:
        where = ""
        params: List[Any] = []
        if dataset_name:
            where = " WHERE dataset_name = ?"
            params.append(dataset_name)

        assets = conn.execute(f"SELECT COUNT(*) FROM multimodal_assets{where}", params).fetchone()[0]
        events = conn.execute(f"SELECT COUNT(*) FROM multimodal_events{where}", params).fetchone()[0]
        detections = conn.execute(f"SELECT COUNT(*) FROM multimodal_detections{where}", params).fetchone()[0]
        annotations = conn.execute(f"SELECT COUNT(*) FROM multimodal_annotations{where}", params).fetchone()[0]
        datasets = [
            dict(row)
            for row in conn.execute(
                "SELECT dataset_name, COUNT(*) AS asset_count FROM multimodal_assets GROUP BY dataset_name ORDER BY asset_count DESC"
            ).fetchall()
        ]
        labels = [
            dict(row)
            for row in conn.execute(
                f"SELECT label, COUNT(*) AS count FROM multimodal_detections{where} "
                "AND label IS NOT NULL AND TRIM(label) != '' GROUP BY label ORDER BY count DESC LIMIT 10"
                if where
                else "SELECT label, COUNT(*) AS count FROM multimodal_detections WHERE label IS NOT NULL AND TRIM(label) != '' GROUP BY label ORDER BY count DESC LIMIT 10",
                params,
            ).fetchall()
        ]
        event_types = [
            dict(row)
            for row in conn.execute(
                f"SELECT event_type, COUNT(*) AS count FROM multimodal_events{where} "
                "AND event_type IS NOT NULL AND TRIM(event_type) != '' GROUP BY event_type ORDER BY count DESC LIMIT 10"
                if where
                else "SELECT event_type, COUNT(*) AS count FROM multimodal_events WHERE event_type IS NOT NULL AND TRIM(event_type) != '' GROUP BY event_type ORDER BY count DESC LIMIT 10",
                params,
            ).fetchall()
        ]
        return {
            "assets": assets,
            "events": events,
            "detections": detections,
            "annotations": annotations,
            "datasets": datasets,
            "top_labels": labels,
            "top_event_types": event_types,
        }
    finally:
        conn.close()


def _extract_time_range(question: str) -> Tuple[Optional[str], Optional[str], str]:
    now = datetime.now()
    if "今天" in question:
        start = datetime(now.year, now.month, now.day)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "今天"
    if "近7天" in question or "最近7天" in question:
        start = now - timedelta(days=7)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "近7天"
    if "近30天" in question or "最近30天" in question:
        start = now - timedelta(days=30)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "近30天"
    if "本周" in question:
        start = now - timedelta(days=now.weekday())
        start = datetime(start.year, start.month, start.day)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "本周"
    return None, None, ""


def _load_vocab(conn: sqlite3.Connection, table: str, column: str) -> List[str]:
    rows = conn.execute(
        f"SELECT DISTINCT {column} FROM {table} WHERE {column} IS NOT NULL AND TRIM({column}) != '' LIMIT 200"
    ).fetchall()
    return [str(row[0]) for row in rows if row[0]]


def _matched_terms(question: str, candidates: Sequence[str]) -> List[str]:
    return [item for item in candidates if item and item in question]


def _build_common_filters(
    question: str,
    dataset_name: str,
    labels: Sequence[str],
    event_types: Sequence[str],
) -> Tuple[str, List[Any], Dict[str, Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    info: Dict[str, Any] = {"matched_labels": [], "matched_event_types": [], "time_range": ""}

    if dataset_name:
        clauses.append("a.dataset_name = ?")
        params.append(dataset_name)

    start_time, end_time, time_label = _extract_time_range(question)
    if start_time and end_time:
        clauses.append("(e.alarm_time >= ? OR a.captured_at >= ?)")
        params.extend([start_time, start_time])
        info["time_range"] = time_label

    matched_labels = _matched_terms(question, labels)
    matched_event_types = _matched_terms(question, event_types)
    info["matched_labels"] = matched_labels
    info["matched_event_types"] = matched_event_types

    if matched_labels:
        clauses.append("(" + " OR ".join(["d.label = ?"] * len(matched_labels)) + ")")
        params.extend(matched_labels)
    if matched_event_types:
        clauses.append("(" + " OR ".join(["e.event_type = ?"] * len(matched_event_types)) + ")")
        params.extend(matched_event_types)

    keywords = [token for token in question.replace("，", " ").replace("。", " ").split() if token]
    if not matched_labels and not matched_event_types and keywords:
        like_clauses = []
        for token in keywords[:4]:
            like_clauses.append(
                "(COALESCE(e.summary,'') LIKE ? OR COALESCE(e.description,'') LIKE ? OR "
                "COALESCE(e.address,'') LIKE ? OR COALESCE(e.device_name,'') LIKE ? OR COALESCE(a.file_name,'') LIKE ?)"
            )
            params.extend([f"%{token}%"] * 5)
        clauses.append("(" + " AND ".join(like_clauses) + ")")

    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params, info


def search_multimodal_assets(question: str, limit: int = 10, dataset_name: str = "") -> Dict[str, Any]:
    init_multimodal_tables()
    conn = _get_conn()
    try:
        label_vocab = _load_vocab(conn, "multimodal_detections", "label")
        event_vocab = _load_vocab(conn, "multimodal_events", "event_type")
        where, params, info = _build_common_filters(question, dataset_name, label_vocab, event_vocab)

        is_count = any(token in question for token in ["多少", "几条", "统计", "数量", "总数", "分布"])
        is_list = any(token in question for token in ["哪些", "列出", "查看", "样本", "图片", "告警", "记录"])

        if is_count and "按类型" in question:
            sql = (
                "SELECT COALESCE(e.event_type, '未分类') AS event_type, COUNT(DISTINCT a.asset_id) AS asset_count "
                "FROM multimodal_assets a "
                "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id "
                "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id "
                f"WHERE {where} "
                "GROUP BY COALESCE(e.event_type, '未分类') "
                "ORDER BY asset_count DESC LIMIT ?"
            )
            rows = [dict(row) for row in conn.execute(sql, params + [limit]).fetchall()]
            summary = f"已按事件类型汇总 {len(rows)} 个分组。"
            return {
                "route": "检测统计聚合",
                "sql": sql,
                "sql_params": params + [limit],
                "columns": ["event_type", "asset_count"],
                "rows": rows,
                "cards": [],
                "summary": summary,
                "tool_summary": "读取 multimodal_assets / multimodal_events / multimodal_detections 做聚合统计。",
                "context": info,
            }

        if is_count:
            row = conn.execute(
                "SELECT COUNT(DISTINCT a.asset_id) AS asset_count, COUNT(DISTINCT e.event_id) AS event_count, "
                "COUNT(d.detection_id) AS detection_count, COUNT(an.annotation_id) AS annotation_count "
                "FROM multimodal_assets a "
                "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id "
                "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id "
                "LEFT JOIN multimodal_annotations an ON an.asset_id = a.asset_id "
                f"WHERE {where}",
                params,
            ).fetchone()
            rows = [dict(row)] if row else []
            summary = (
                f"命中资产 {row['asset_count'] if row else 0} 条，"
                f"事件 {row['event_count'] if row else 0} 条，"
                f"检测 {row['detection_count'] if row else 0} 条。"
            )
            return {
                "route": "检测统计聚合",
                "sql": f"SELECT COUNT ... FROM multimodal_* WHERE {where}",
                "sql_params": params,
                "columns": ["asset_count", "event_count", "detection_count", "annotation_count"],
                "rows": rows,
                "cards": [],
                "summary": summary,
                "tool_summary": "围绕检测资产、事件和标注表做聚合统计。",
                "context": info,
            }

        sql = (
            "SELECT a.asset_id, a.file_name, a.file_path, a.media_type, a.captured_at, "
            "e.event_type, e.alarm_time, e.summary, e.description, e.address, e.device_name, "
            "GROUP_CONCAT(DISTINCT d.label) AS labels, MAX(d.confidence) AS max_confidence "
            "FROM multimodal_assets a "
            "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id "
            "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id "
            f"WHERE {where} "
            "GROUP BY a.asset_id, a.file_name, a.file_path, a.media_type, a.captured_at, "
            "e.event_type, e.alarm_time, e.summary, e.description, e.address, e.device_name "
            "ORDER BY COALESCE(e.alarm_time, a.captured_at, a.imported_at) DESC LIMIT ?"
        )
        records = [dict(row) for row in conn.execute(sql, params + [limit]).fetchall()]
        cards = [
            {
                "id": item["asset_id"],
                "doc_name": item.get("file_name") or item.get("asset_id"),
                "doc_type": item.get("media_type") or "image",
                "source_uri": item.get("file_path") or "",
                "distance": 0,
                "file_hash": item.get("asset_id") or "",
                "text": " | ".join(
                    [
                        str(item.get("event_type") or "").strip(),
                        str(item.get("summary") or item.get("description") or "").strip(),
                        str(item.get("labels") or "").strip(),
                    ]
                ).strip(" | "),
            }
            for item in records
        ]
        summary = f"已返回 {len(records)} 条检测资产记录，可继续追问时间范围、事件类型或目标类别。"
        if not records and is_list:
            summary = "当前条件下没有命中检测资产，建议缩小时间范围或换一个目标类别。"
        return {
            "route": "检测资产检索",
            "sql": sql,
            "sql_params": params + [limit],
            "columns": list(records[0].keys()) if records else [],
            "rows": records,
            "cards": cards,
            "summary": summary,
            "tool_summary": "读取 multimodal_assets / multimodal_events / multimodal_detections 做列表检索与样本补充。",
            "context": info,
        }
    finally:
        conn.close()


def get_dataset_overview_text(dataset_name: str = "") -> str:
    summary = get_multimodal_summary(dataset_name)
    top_label = summary["top_labels"][0]["label"] if summary["top_labels"] else "暂无"
    top_event = summary["top_event_types"][0]["event_type"] if summary["top_event_types"] else "暂无"
    return (
        f"当前已承接 {summary['assets']} 条检测资产、{summary['events']} 条事件、"
        f"{summary['detections']} 条检测框、{summary['annotations']} 条人工标注。"
        f"高频检测类别为 {top_label}，高频事件类型为 {top_event}。"
    )
