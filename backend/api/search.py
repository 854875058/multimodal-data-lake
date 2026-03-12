# -*- coding: utf-8 -*-
"""向量搜索 API"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models_loader import load_models_cached, get_lancedb_tables
from text_codec import decode_text_from_storage

logger = logging.getLogger(__name__)
router = APIRouter()

class SearchRequest(BaseModel):
    query: str
    mode: str = "text"  # text, image, audio
    limit: int = 10

class SearchResult(BaseModel):
    id: str
    text: Optional[str] = None
    doc_name: str
    doc_type: str
    source_uri: str
    distance: float
    file_hash: str

class SearchResponse(BaseModel):
    success: bool
    results: List[SearchResult]
    count: int
    message: str = ""

@router.post("/", response_model=SearchResponse)
async def search(req: SearchRequest):
    """向量搜索接口"""
    try:
        if not req.query or not req.query.strip():
            return SearchResponse(success=False, results=[], count=0, message="搜索内容不能为空")

        limit = max(1, min(req.limit, 100))

        # 加载模型和表
        models = load_models_cached()
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()

        if req.mode == "text":
            # 文本搜索
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

            return SearchResponse(
                success=True,
                results=search_results,
                count=len(search_results)
            )

        elif req.mode == "image":
            # 图像搜索（文本查询图像）
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

            return SearchResponse(
                success=True,
                results=search_results,
                count=len(search_results)
            )

        else:
            return SearchResponse(
                success=False,
                results=[],
                count=0,
                message=f"不支持的搜索模式: {req.mode}"
            )

    except Exception as e:
        logger.error(f"搜索失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="搜索失败，请稍后重试")
