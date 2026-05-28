# -*- coding: utf-8 -*-
"""向量搜索 API（含混合检索 RRF）"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.models_loader import load_models_cached, get_lancedb_tables
from backend.utils.text_codec import decode_text_from_storage

logger = logging.getLogger(__name__)
router = APIRouter()

class SearchRequest(BaseModel):
    query: str
    mode: str = "text"  # text, image, audio, hybrid
    limit: int = 10
    # 混合检索参数
    hybrid_alpha: float = 0.5   # 向量权重，1-alpha 为关键词权重
    rrf_k: int = 60             # RRF 常数，通常 60

class SearchResult(BaseModel):
    id: str
    text: Optional[str] = None
    doc_name: str
    doc_type: str
    source_uri: str
    distance: float
    file_hash: str
    score: Optional[float] = None   # RRF 综合分数（混合检索时返回）

class SearchResponse(BaseModel):
    success: bool
    results: List[SearchResult]
    count: int
    message: str = ""


def _rrf_fuse(vec_rows, kw_rows, rrf_k: int = 60, limit: int = 10) -> list:
    """
    Reciprocal Rank Fusion：合并向量检索和关键词检索的结果。
    vec_rows / kw_rows 均为 pandas DataFrame，需有 id 列。
    返回按 RRF 分数排序的 id 列表（含 rrf_score）。
    """
    scores: dict = {}

    for rank, (_, row) in enumerate(vec_rows.iterrows()):
        rid = str(row["id"])
        scores[rid] = scores.get(rid, 0) + 1.0 / (rrf_k + rank + 1)

    for rank, (_, row) in enumerate(kw_rows.iterrows()):
        rid = str(row["id"])
        scores[rid] = scores.get(rid, 0) + 1.0 / (rrf_k + rank + 1)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked[:limit]


def _keyword_search(tbl, query: str, limit: int):
    """
    基于 LanceDB FTS（全文搜索）的关键词检索，若不支持则返回空 DataFrame。
    """
    import pandas as pd
    try:
        results = tbl.search(query, query_type="fts").limit(limit).to_pandas()
        return results
    except Exception:
        try:
            # 降级：使用 WHERE LIKE 过滤（仅对 text 列）
            results = tbl.search().where(f"text LIKE '%{query}%'").limit(limit).to_pandas()
            return results
        except Exception:
            return pd.DataFrame()


@router.post("/", response_model=SearchResponse)
async def search(req: SearchRequest):
    """向量/混合/图像搜索接口"""
    try:
        if not req.query or not req.query.strip():
            return SearchResponse(success=False, results=[], count=0, message="搜索内容不能为空")

        limit = max(1, min(req.limit, 100))

        models = load_models_cached()
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()

        # ── 文本向量检索 ──────────────────────────────────────────
        if req.mode == "text":
            model = models["text"]
            query_vec = model.encode(req.query).tolist()
            results = tbl_text.search(query_vec).limit(limit).to_pandas()

            search_results = []
            for _, row in results.iterrows():
                search_results.append(SearchResult(
                    id=row["id"],
                    text=decode_text_from_storage(row.get("text", "")),
                    doc_name=row["doc_name"],
                    doc_type=row["doc_type"],
                    source_uri=row["source_uri"],
                    distance=float(row.get("_distance", 0)),
                    file_hash=row.get("file_hash", "")
                ))

            return SearchResponse(success=True, results=search_results, count=len(search_results))

        # ── 图像检索（文本→图像）──────────────────────────────────
        elif req.mode == "image":
            model = models["clip_text"]
            query_vec = model.encode(req.query).tolist()
            results = tbl_image.search(query_vec).limit(limit).to_pandas()

            search_results = []
            for _, row in results.iterrows():
                search_results.append(SearchResult(
                    id=row["id"],
                    doc_name=row["doc_name"],
                    doc_type="image",
                    source_uri=row["source_uri"],
                    distance=float(row.get("_distance", 0)),
                    file_hash=row.get("file_hash", "")
                ))

            return SearchResponse(success=True, results=search_results, count=len(search_results))

        # ── 混合检索（RRF：向量 + 关键词）───────────────────────────
        elif req.mode == "hybrid":
            model = models["text"]
            query_vec = model.encode(req.query).tolist()

            # 向量检索：取更多候选，留给 RRF 过滤
            vec_candidate = min(limit * 3, 100)
            vec_rows = tbl_text.search(query_vec).limit(vec_candidate).to_pandas()

            # 关键词检索
            kw_rows = _keyword_search(tbl_text, req.query.strip(), vec_candidate)

            # RRF 融合
            fused = _rrf_fuse(vec_rows, kw_rows, rrf_k=req.rrf_k, limit=limit)
            fused_ids = {rid: score for rid, score in fused}

            # 构建 id → row 映射（优先从向量结果取完整信息）
            id_row_map = {}
            for _, row in vec_rows.iterrows():
                id_row_map[str(row["id"])] = row
            if not kw_rows.empty:
                for _, row in kw_rows.iterrows():
                    rid = str(row["id"])
                    if rid not in id_row_map:
                        id_row_map[rid] = row

            search_results = []
            for rid, rrf_score in fused:
                row = id_row_map.get(rid)
                if row is None:
                    continue
                search_results.append(SearchResult(
                    id=rid,
                    text=decode_text_from_storage(row.get("text", "")),
                    doc_name=row.get("doc_name", ""),
                    doc_type=row.get("doc_type", ""),
                    source_uri=row.get("source_uri", ""),
                    distance=float(row.get("_distance", 0)),
                    file_hash=row.get("file_hash", ""),
                    score=round(rrf_score, 6)
                ))

            return SearchResponse(
                success=True,
                results=search_results,
                count=len(search_results),
                message=f"混合检索（RRF k={req.rrf_k}），向量候选 {len(vec_rows)} 条，关键词候选 {len(kw_rows)} 条"
            )

        else:
            return SearchResponse(
                success=False, results=[], count=0,
                message=f"不支持的搜索模式: {req.mode}，可选值：text / image / hybrid"
            )

    except Exception as e:
        logger.error(f"搜索失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="搜索失败，请稍后重试")
