# -*- coding: utf-8 -*-
"""LanceDB + DuckDB storage helpers for Tower-Eye multimodal detection data."""

import duckdb
import logging
import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pyarrow as pa

from models_loader import get_multimodal_lancedb_tables

logger = logging.getLogger(__name__)


def init_multimodal_tables() -> None:
    """Ensure multimodal Lance tables exist."""
    get_multimodal_lancedb_tables()


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _coerce_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _dataset_filter_expr(dataset_name: str) -> str:
    escaped = dataset_name.replace("\\", "\\\\").replace("'", "\\'")
    return f"dataset_name = '{escaped}'"


def _add_rows(table, rows: List[Dict[str, Any]], schema: pa.Schema, batch_size: int = 2000) -> None:
    if not rows:
        return
    for start in range(0, len(rows), batch_size):
        chunk = rows[start:start + batch_size]
        arrow_table = pa.Table.from_pylist(chunk, schema=schema)
        table.add(arrow_table)


def _register_arrow_table(con: duckdb.DuckDBPyConnection, name: str, table) -> None:
    arrow_table = table.to_arrow()
    con.register(name, arrow_table)


def _get_duckdb_connection() -> duckdb.DuckDBPyConnection:
    init_multimodal_tables()
    tbl_assets, tbl_events, tbl_detections, tbl_annotations = get_multimodal_lancedb_tables()
    con = duckdb.connect(":memory:")
    _register_arrow_table(con, "multimodal_assets", tbl_assets)
    _register_arrow_table(con, "multimodal_events", tbl_events)
    _register_arrow_table(con, "multimodal_detections", tbl_detections)
    _register_arrow_table(con, "multimodal_annotations", tbl_annotations)
    return con


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
    tbl_assets, tbl_events, tbl_detections, tbl_annotations = get_multimodal_lancedb_tables()
    imported_at = datetime.now().isoformat(sep=" ", timespec="seconds")

    try:
        assets_sql = "SELECT * FROM assets ORDER BY created_at DESC"
        if limit and limit > 0:
            assets_sql += f" LIMIT {int(limit)}"

        asset_rows = source.execute(assets_sql).fetchall()
        asset_ids = [str(row["asset_id"]) for row in asset_rows]
        event_rows = _select_table_rows(source, "events", "asset_id", asset_ids)
        detection_rows = _select_table_rows(source, "detections", "asset_id", asset_ids)
        annotation_rows = _select_table_rows(source, "annotations", "asset_id", asset_ids)

        dataset_expr = _dataset_filter_expr(dataset_name)
        for table in (tbl_assets, tbl_events, tbl_detections, tbl_annotations):
            try:
                table.delete(dataset_expr)
            except Exception:
                logger.warning("failed to delete existing dataset rows from %s", getattr(table, "name", "table"), exc_info=True)

        asset_docs = [{
            "asset_id": _coerce_text(row["asset_id"]),
            "dataset_name": dataset_name,
            "media_type": _coerce_text(row["media_type"]),
            "file_path": _coerce_text(row["file_path"]),
            "file_name": _coerce_text(row["file_name"]),
            "sha256": _coerce_text(row["sha256"]),
            "width": _coerce_int(row["width"]),
            "height": _coerce_int(row["height"]),
            "duration_sec": _coerce_float(row["duration_sec"]),
            "captured_at": _coerce_text(row["captured_at"]),
            "lat": _coerce_float(row["lat"]),
            "lon": _coerce_float(row["lon"]),
            "source": _coerce_text(row["source"]),
            "created_at": _coerce_text(row["created_at"]),
            "imported_at": imported_at,
        } for row in asset_rows]

        event_docs = [{
            "event_id": _coerce_text(row["event_id"]),
            "asset_id": _coerce_text(row["asset_id"]),
            "dataset_name": dataset_name,
            "event_type": _coerce_text(row["event_type"]),
            "alarm_level": _coerce_text(row["alarm_level"]),
            "alarm_source": _coerce_text(row["alarm_source"]),
            "alarm_time": _coerce_text(row["alarm_time"]),
            "lat": _coerce_float(row["lat"]),
            "lon": _coerce_float(row["lon"]),
            "region": _coerce_text(row["region"]),
            "extra_json": _coerce_text(row["extra_json"]),
            "summary": _coerce_text(row["summary"]),
            "description": _coerce_text(row["description"]),
            "address": _coerce_text(row["address"]),
            "device_name": _coerce_text(row["device_name"]),
            "confidence_level": _coerce_float(row["confidence_level"]),
            "province_name": _coerce_text(row["province_name"]),
            "city_name": _coerce_text(row["city_name"]),
            "county_name": _coerce_text(row["county_name"]),
            "town_code": _coerce_text(row["town_code"]),
            "town_name": _coerce_text(row["town_name"]),
            "device_code": _coerce_text(row["device_code"]),
            "channel_code": _coerce_text(row["channel_code"]),
            "channel_name": _coerce_text(row["channel_name"]),
            "warning_order_id": _coerce_text(row["warning_order_id"]),
            "warning_type_id": _coerce_text(row["warning_type_id"]),
            "alarm_body": _coerce_text(row["alarm_body"]),
            "algorithm_code": _coerce_text(row["algorithm_code"]),
            "algorithm_name": _coerce_text(row["algorithm_name"]),
            "emergency_level": _coerce_text(row["emergency_level"]),
            "importance_level": _coerce_text(row["importance_level"]),
            "order_status": _coerce_text(row["order_status"]),
            "confidence_level_max": _coerce_float(row["confidence_level_max"]),
            "tenant_name": _coerce_text(row["tenant_name"]),
            "video_path": _coerce_text(row["video_path"]),
            "img_src_path": _coerce_text(row["img_src_path"]),
            "img_icon_path": _coerce_text(row["img_icon_path"]),
            "created_at": _coerce_text(row["created_at"]),
            "imported_at": imported_at,
        } for row in event_rows]

        detection_docs = [{
            "detection_id": _coerce_text(row["detection_id"]),
            "asset_id": _coerce_text(row["asset_id"]),
            "dataset_name": dataset_name,
            "model_name": _coerce_text(row["model_name"]),
            "label": _coerce_text(row["label"]),
            "confidence": _coerce_float(row["confidence"]),
            "bbox_x": _coerce_float(row["bbox_x"]),
            "bbox_y": _coerce_float(row["bbox_y"]),
            "bbox_w": _coerce_float(row["bbox_w"]),
            "bbox_h": _coerce_float(row["bbox_h"]),
            "frame_index": _coerce_int(row["frame_index"]),
            "timestamp_sec": _coerce_float(row["timestamp_sec"]),
            "created_at": _coerce_text(row["created_at"]),
            "imported_at": imported_at,
        } for row in detection_rows]

        annotation_docs = [{
            "annotation_id": _coerce_text(row["annotation_id"]),
            "asset_id": _coerce_text(row["asset_id"]),
            "dataset_name": dataset_name,
            "label": _coerce_text(row["label"]),
            "bbox_x": _coerce_float(row["bbox_x"]),
            "bbox_y": _coerce_float(row["bbox_y"]),
            "bbox_w": _coerce_float(row["bbox_w"]),
            "bbox_h": _coerce_float(row["bbox_h"]),
            "origin": _coerce_text(row["origin"]),
            "reviewer": _coerce_text(row["reviewer"]),
            "reviewed_at": _coerce_text(row["reviewed_at"]),
            "created_at": _coerce_text(row["created_at"]),
            "imported_at": imported_at,
        } for row in annotation_rows]

        _add_rows(tbl_assets, asset_docs, tbl_assets.schema)
        _add_rows(tbl_events, event_docs, tbl_events.schema)
        _add_rows(tbl_detections, detection_docs, tbl_detections.schema)
        _add_rows(tbl_annotations, annotation_docs, tbl_annotations.schema)

        return {
            "dataset_name": dataset_name,
            "source_db_path": str(src_path),
            "assets": len(asset_docs),
            "events": len(event_docs),
            "detections": len(detection_docs),
            "annotations": len(annotation_docs),
            "storage": "lancedb+duckdb",
            "imported_at": imported_at,
        }
    finally:
        source.close()


def get_multimodal_summary(dataset_name: str = "") -> Dict[str, Any]:
    con = _get_duckdb_connection()
    try:
        where = ""
        params: List[Any] = []
        if dataset_name:
            where = " WHERE dataset_name = ?"
            params.append(dataset_name)

        assets = con.execute(f"SELECT COUNT(*) FROM multimodal_assets{where}", params).fetchone()[0]
        events = con.execute(f"SELECT COUNT(*) FROM multimodal_events{where}", params).fetchone()[0]
        detections = con.execute(f"SELECT COUNT(*) FROM multimodal_detections{where}", params).fetchone()[0]
        annotations = con.execute(f"SELECT COUNT(*) FROM multimodal_annotations{where}", params).fetchone()[0]

        datasets = [
            {"dataset_name": row[0], "asset_count": row[1]}
            for row in con.execute(
                "SELECT dataset_name, COUNT(*) AS asset_count "
                "FROM multimodal_assets GROUP BY dataset_name ORDER BY asset_count DESC"
            ).fetchall()
        ]
        labels = [
            {"label": row[0], "count": row[1]}
            for row in con.execute(
                f"SELECT label, COUNT(*) AS count FROM multimodal_detections{where} "
                + (" AND " if where else " WHERE ")
                + "label IS NOT NULL AND TRIM(label) <> '' "
                "GROUP BY label ORDER BY count DESC LIMIT 10",
                params,
            ).fetchall()
        ]
        event_types = [
            {"event_type": row[0], "count": row[1]}
            for row in con.execute(
                f"SELECT event_type, COUNT(*) AS count FROM multimodal_events{where} "
                + (" AND " if where else " WHERE ")
                + "event_type IS NOT NULL AND TRIM(event_type) <> '' "
                "GROUP BY event_type ORDER BY count DESC LIMIT 10",
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
            "storage": "lancedb+duckdb",
        }
    finally:
        con.close()


def _extract_time_range(question: str) -> Tuple[Optional[str], Optional[str], str]:
    now = datetime.now()
    if "今天" in question:
        start = datetime(now.year, now.month, now.day)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "今天"
    if "近7天" in question or "最近7天" in question:
        start = now - timedelta(days=7)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "最近7天"
    if "近30天" in question or "最近30天" in question:
        start = now - timedelta(days=30)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "最近30天"
    if "本周" in question:
        start = now - timedelta(days=now.weekday())
        start = datetime(start.year, start.month, start.day)
        return start.isoformat(sep=" "), now.isoformat(sep=" "), "本周"
    return None, None, ""


def _load_vocab(con: duckdb.DuckDBPyConnection, table: str, column: str) -> List[str]:
    rows = con.execute(
        f'SELECT DISTINCT "{column}" FROM {table} '
        f'WHERE "{column}" IS NOT NULL AND TRIM(CAST("{column}" AS VARCHAR)) <> \'\' LIMIT 200'
    ).fetchall()
    return [str(row[0]) for row in rows if row and row[0]]


def _matched_terms(question: str, candidates: Sequence[str]) -> List[str]:
    return [item for item in candidates if item and item in question]


def _first_media_path(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return next((part.strip() for part in raw.split(",") if part.strip()), "")


def _find_related_image_paths(
    con: duckdb.DuckDBPyConnection,
    dataset_name: str,
    video_path: str,
    current_image_path: str,
    limit: int = 12,
) -> List[str]:
    stem = Path(_first_media_path(video_path)).stem
    if not stem:
        return []

    current_name = Path(_first_media_path(current_image_path)).name
    sql = (
        "SELECT DISTINCT img_src_path, file_path FROM multimodal_events "
        "WHERE dataset_name = ? AND video_path LIKE ? LIMIT ?"
    )
    rows = con.execute(sql, [dataset_name, f"%{stem}%", limit * 3]).fetchall()
    related: List[str] = []
    seen = set()
    for img_src_path, file_path in rows:
        for candidate in (_first_media_path(img_src_path), _first_media_path(file_path)):
            if not candidate:
                continue
            name = Path(candidate).name
            if name and name != current_name and name not in seen:
                seen.add(name)
                related.append(candidate)
                if len(related) >= limit:
                    return related
    return related


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
        clauses.append("(COALESCE(e.alarm_time, '') >= ? OR COALESCE(a.captured_at, '') >= ?)")
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

    keywords = [
        token for token in
        question.replace("，", " ").replace("。", " ").replace(",", " ").split()
        if token
    ]
    should_use_keywords = bool(keywords)
    if len(keywords) == 1 and len(keywords[0]) > 8:
        should_use_keywords = False
    if any(token in question for token in ["哪些", "样本", "记录", "图片", "告警"]) and not matched_labels and not matched_event_types:
        should_use_keywords = False

    if not matched_labels and not matched_event_types and should_use_keywords:
        keyword_clauses = []
        for token in keywords[:4]:
            keyword_clauses.append(
                "("
                "COALESCE(e.summary, '') LIKE ? OR "
                "COALESCE(e.description, '') LIKE ? OR "
                "COALESCE(e.address, '') LIKE ? OR "
                "COALESCE(e.device_name, '') LIKE ? OR "
                "COALESCE(a.file_name, '') LIKE ?"
                ")"
            )
            params.extend([f"%{token}%"] * 5)
        clauses.append("(" + " AND ".join(keyword_clauses) + ")")

    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params, info


def search_multimodal_assets(question: str, limit: int = 10, dataset_name: str = "") -> Dict[str, Any]:
    con = _get_duckdb_connection()
    try:
        label_vocab = _load_vocab(con, "multimodal_detections", "label")
        event_vocab = _load_vocab(con, "multimodal_events", "event_type")
        where, params, info = _build_common_filters(question, dataset_name, label_vocab, event_vocab)

        is_count = any(token in question for token in ["多少", "几条", "统计", "数量", "总数", "分布"])
        wants_group = any(token in question for token in ["按类型", "分类", "排行", "排名", "TOP"])

        if is_count and wants_group:
            sql = (
                "SELECT COALESCE(e.event_type, '未分类') AS event_type, "
                "COUNT(DISTINCT a.asset_id) AS asset_count "
                "FROM multimodal_assets a "
                "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id AND e.dataset_name = a.dataset_name "
                "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id AND d.dataset_name = a.dataset_name "
                f"WHERE {where} "
                "GROUP BY COALESCE(e.event_type, '未分类') "
                "ORDER BY asset_count DESC LIMIT ?"
            )
            rows_raw = con.execute(sql, params + [limit]).fetchall()
            rows = [{"event_type": row[0], "asset_count": row[1]} for row in rows_raw]
            return {
                "route": "检测统计聚合",
                "sql": sql,
                "sql_params": params + [limit],
                "columns": ["event_type", "asset_count"],
                "rows": rows,
                "cards": [],
                "summary": f"已按事件类型汇总 {len(rows)} 个分组。",
                "tool_summary": "通过 DuckDB 联查 Lance 中的 multimodal_assets、multimodal_events、multimodal_detections。",
                "context": info,
            }

        if is_count:
            sql = (
                "SELECT COUNT(DISTINCT a.asset_id) AS asset_count, "
                "COUNT(DISTINCT e.event_id) AS event_count, "
                "COUNT(DISTINCT d.detection_id) AS detection_count, "
                "COUNT(DISTINCT an.annotation_id) AS annotation_count "
                "FROM multimodal_assets a "
                "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id AND e.dataset_name = a.dataset_name "
                "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id AND d.dataset_name = a.dataset_name "
                "LEFT JOIN multimodal_annotations an ON an.asset_id = a.asset_id AND an.dataset_name = a.dataset_name "
                f"WHERE {where}"
            )
            row = con.execute(sql, params).fetchone()
            result_row = {
                "asset_count": row[0] if row else 0,
                "event_count": row[1] if row else 0,
                "detection_count": row[2] if row else 0,
                "annotation_count": row[3] if row else 0,
            }
            return {
                "route": "检测统计聚合",
                "sql": sql,
                "sql_params": params,
                "columns": list(result_row.keys()),
                "rows": [result_row],
                "cards": [],
                "summary": (
                    f"命中资产 {result_row['asset_count']} 条，"
                    f"事件 {result_row['event_count']} 条，"
                    f"检测 {result_row['detection_count']} 条，"
                    f"标注 {result_row['annotation_count']} 条。"
                ),
                "tool_summary": "围绕 Lance 表中的资产、事件、检测和标注数据完成聚合统计。",
                "context": info,
            }

        sql = (
            "SELECT "
            "a.asset_id, a.dataset_name, a.file_name, a.file_path, a.media_type, a.captured_at, "
            "e.event_type, e.alarm_time, e.summary, e.description, e.address, e.device_name, "
            "e.img_src_path, e.img_icon_path, e.video_path, "
            "string_agg(DISTINCT NULLIF(d.label, ''), ', ') AS labels, "
            "MAX(d.confidence) AS max_confidence "
            "FROM multimodal_assets a "
            "LEFT JOIN multimodal_events e ON e.asset_id = a.asset_id AND e.dataset_name = a.dataset_name "
            "LEFT JOIN multimodal_detections d ON d.asset_id = a.asset_id AND d.dataset_name = a.dataset_name "
            f"WHERE {where} "
            "GROUP BY "
            "a.asset_id, a.dataset_name, a.file_name, a.file_path, a.media_type, a.captured_at, "
            "e.event_type, e.alarm_time, e.summary, e.description, e.address, e.device_name, "
            "e.img_src_path, e.img_icon_path, e.video_path "
            "ORDER BY COALESCE(e.alarm_time, a.captured_at, '') DESC LIMIT ?"
        )
        rows_raw = con.execute(sql, params + [limit]).fetchall()
        columns = [desc[0] for desc in con.description]
        records = [dict(zip(columns, row)) for row in rows_raw]

        cards = []
        for item in records:
            related_image_paths = _find_related_image_paths(
                con,
                item.get("dataset_name") or "",
                item.get("video_path") or "",
                item.get("img_src_path") or item.get("file_path") or "",
            )
            cards.append({
                "id": item["asset_id"],
                "doc_name": item.get("file_name") or item.get("asset_id"),
                "doc_type": item.get("media_type") or "image",
                "source_uri": item.get("file_path") or item.get("img_src_path") or "",
                "distance": 0,
                "file_hash": item.get("asset_id") or "",
                "text": " | ".join(part for part in [
                    item.get("event_type") or "",
                    item.get("summary") or item.get("description") or "",
                    item.get("labels") or "",
                ] if part),
                "event_type": item.get("event_type") or "",
                "alarm_time": item.get("alarm_time") or "",
                "labels": item.get("labels") or "",
                "summary": item.get("summary") or "",
                "description": item.get("description") or "",
                "address": item.get("address") or "",
                "device_name": item.get("device_name") or "",
                "img_src_path": item.get("img_src_path") or "",
                "img_icon_path": item.get("img_icon_path") or "",
                "video_path": item.get("video_path") or "",
                "related_image_paths": related_image_paths,
            })

        summary = f"已返回 {len(records)} 条检测资产记录，可继续追问时间范围、事件类型或目标类别。"
        if not records:
            summary = "当前条件下没有命中检测资产，建议缩小时间范围或更换目标类别。"

        return {
            "route": "检测资产检索",
            "sql": sql,
            "sql_params": params + [limit],
            "columns": columns,
            "rows": records,
            "cards": cards,
            "summary": summary,
            "tool_summary": "通过 DuckDB 读取 Lance 表，完成事件联查、标签聚合和样本返回。",
            "context": info,
        }
    finally:
        con.close()


def get_dataset_overview_text(dataset_name: str = "") -> str:
    summary = get_multimodal_summary(dataset_name)
    top_label = summary["top_labels"][0]["label"] if summary["top_labels"] else "暂无"
    top_event = summary["top_event_types"][0]["event_type"] if summary["top_event_types"] else "暂无"
    return (
        f"当前已接入 {summary['assets']} 条检测资产、{summary['events']} 条事件、"
        f"{summary['detections']} 条检测框、{summary['annotations']} 条人工标注。"
        f"高频检测类别为 {top_label}，高频事件类型为 {top_event}。"
    )


def export_review_manifest(dataset_name: str = "tower_eye", limit: int = 0) -> List[Dict[str, Any]]:
    con = _get_duckdb_connection()
    try:
        limit_clause = " LIMIT ?" if limit and limit > 0 else ""
        params: List[Any] = [dataset_name]
        if limit and limit > 0:
            params.append(limit)
        assets_sql = (
            "SELECT asset_id, media_type, file_path, file_name, lat, lon, captured_at "
            "FROM multimodal_assets WHERE dataset_name = ? "
            "ORDER BY COALESCE(captured_at, created_at, imported_at) DESC"
            f"{limit_clause}"
        )
        asset_rows = con.execute(assets_sql, params).fetchall()
        manifest: List[Dict[str, Any]] = []
        for asset_id, media_type, file_path, file_name, lat, lon, captured_at in asset_rows:
            detection_rows = con.execute(
                "SELECT label, confidence, bbox_x, bbox_y, bbox_w, bbox_h, frame_index, timestamp_sec "
                "FROM multimodal_detections WHERE dataset_name = ? AND asset_id = ?",
                [dataset_name, asset_id],
            ).fetchall()
            predictions = [
                {
                    "label": row[0],
                    "confidence": row[1],
                    "bbox": [row[2], row[3], row[4], row[5]],
                    "frame_index": row[6],
                    "timestamp_sec": row[7],
                }
                for row in detection_rows
            ]
            manifest.append({
                "asset_id": asset_id,
                "media_type": media_type,
                "file_path": file_path,
                "file_name": file_name,
                "lat": lat,
                "lon": lon,
                "captured_at": captured_at,
                "predictions": predictions,
            })
        return manifest
    finally:
        con.close()


def import_review_manifest(
    records: List[Dict[str, Any]],
    dataset_name: str = "tower_eye",
    reviewer: str = "reviewer",
    origin: str = "review",
) -> Dict[str, Any]:
    init_multimodal_tables()
    _, _, _, tbl_annotations = get_multimodal_lancedb_tables()
    imported_at = datetime.now().isoformat(sep=" ", timespec="seconds")
    rows: List[Dict[str, Any]] = []
    for record in records:
        asset_id = str(record.get("asset_id") or "").strip()
        if not asset_id:
            continue
        annotations = record.get("annotations") or []
        for ann in annotations:
            bbox = ann.get("bbox") or [None, None, None, None]
            rows.append({
                "annotation_id": uuid.uuid4().hex,
                "asset_id": asset_id,
                "dataset_name": dataset_name,
                "label": str(ann.get("label") or ""),
                "bbox_x": bbox[0],
                "bbox_y": bbox[1],
                "bbox_w": bbox[2],
                "bbox_h": bbox[3],
                "origin": origin,
                "reviewer": reviewer,
                "reviewed_at": imported_at,
                "created_at": imported_at,
                "imported_at": imported_at,
            })

    if rows:
        _add_rows(tbl_annotations, rows, tbl_annotations.schema)

    return {
        "dataset_name": dataset_name,
        "reviewer": reviewer,
        "origin": origin,
        "annotations": len(rows),
        "imported_at": imported_at,
    }
