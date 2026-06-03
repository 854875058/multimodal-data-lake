# -*- coding: utf-8 -*-
"""Dashboard and knowledge-graph API."""

import logging
from typing import Any, Dict, List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.database import get_file_entities, get_file_entity_relations
from backend.core.models_loader import get_lancedb_tables, load_models_cached
from backend.services.stats_service import get_dashboard_stats, get_task_trend
from backend.utils.text_codec import decode_text_from_storage

logger = logging.getLogger(__name__)
router = APIRouter()


class DashboardStats(BaseModel):
    total_files: int
    today_files: int
    week_files: int
    week_tasks_total: int
    week_tasks_success: int
    week_success_rate: float
    week_avg_time_sec: float
    text_rows: int
    image_rows: int


class TrendData(BaseModel):
    date: str
    file_count: int
    success_count: int


class FileTypeCount(BaseModel):
    doc_type: str
    count: int


class EntityData(BaseModel):
    file_hash: str
    entity_name: str
    entity_type: str


class KnowledgeGraphResponse(BaseModel):
    success: bool
    mode: str
    message: str = ''
    nodes: List[Dict[str, Any]]
    links: List[Dict[str, Any]]
    categories: List[Dict[str, Any]]


ENTITY_COLORS = {
    '人名': '#ef4444',
    '地名': '#f59e0b',
    '组织': '#10b981',
    '技术术语': '#8b5cf6',
    '产品': '#06b6d4',
    '系统': '#6366f1',
    '部门': '#14b8a6',
    '事件': '#f97316',
    '时间': '#64748b',
    '实体': '#6b7280',
}


def _trim_label(value: str, max_length: int = 30) -> str:
    text = str(value or '').strip()
    if len(text) <= max_length:
        return text
    if max_length <= 3:
        return text[:max_length]
    return text[: max_length - 3] + '...'


def _build_empty_graph(message: str = '暂无可用于构建知识图谱的数据') -> Dict[str, Any]:
    return {
        'success': True,
        'mode': 'empty',
        'message': message,
        'nodes': [],
        'links': [],
        'categories': [{'name': '文档'}, {'name': '实体'}],
    }


def _build_entity_graph(files_df, all_entities, all_relations=None):
    hash_to_name = {}
    for _, row in files_df.iterrows():
        file_hash = str(row.get('file_hash', '') or '').strip()
        doc_name = _trim_label(row.get('doc_name', ''), 30)
        if file_hash and doc_name:
            hash_to_name[file_hash] = doc_name

    if not hash_to_name:
        return None

    nodes = []
    node_set = set()
    entity_types = {}
    mention_links = []
    relation_links = []

    for doc_name in hash_to_name.values():
        if doc_name in node_set:
            continue
        nodes.append({
            'name': doc_name,
            'symbolSize': 30,
            'category': 0,
            'itemStyle': {'color': '#3b82f6'},
        })
        node_set.add(doc_name)

    for entity in all_entities:
        file_hash = str(entity.get('file_hash', '') or '').strip()
        entity_name = _trim_label(entity.get('entity_name', ''), 20)
        entity_type = str(entity.get('entity_type', '') or '实体').strip() or '实体'
        doc_name = hash_to_name.get(file_hash)
        if not doc_name or not entity_name:
            continue

        previous_type = entity_types.get(entity_name)
        if previous_type in (None, '实体') or (entity_type != '实体' and previous_type == '实体'):
            entity_types[entity_name] = entity_type

        if entity_name not in node_set:
            nodes.append({
                'name': entity_name,
                'symbolSize': 20,
                'category': 1,
                'itemStyle': {'color': ENTITY_COLORS.get(entity_type, '#6b7280')},
                'value': entity_type,
            })
            node_set.add(entity_name)

        mention_links.append({
            'source': doc_name,
            'target': entity_name,
            'value': '提及',
            'lineStyle': {'width': 1.5, 'opacity': 0.35, 'color': '#94a3b8'},
        })

    relation_count = 0
    if all_relations:
        valid_entities = set(entity_types.keys())
        seen_relations = set()
        for relation in all_relations:
            source_name = _trim_label(relation.get('source_entity', ''), 20)
            target_name = _trim_label(relation.get('target_entity', ''), 20)
            relation_type = _trim_label(relation.get('relation_type', '') or '相关', 12)
            if (
                not source_name
                or not target_name
                or source_name == target_name
                or source_name not in valid_entities
                or target_name not in valid_entities
            ):
                continue

            relation_key = (source_name, relation_type, target_name)
            if relation_key in seen_relations:
                continue
            seen_relations.add(relation_key)
            relation_count += 1
            relation_links.append({
                'source': source_name,
                'target': target_name,
                'value': relation_type,
                'lineStyle': {'width': 2.4, 'opacity': 0.88, 'color': '#8b5cf6'},
            })

    links = mention_links + relation_links
    if not links:
        return None

    max_nodes = 120
    if len(nodes) > max_nodes:
        nodes = nodes[:max_nodes]
        valid_names = {node['name'] for node in nodes}
        links = [link for link in links if link['source'] in valid_names and link['target'] in valid_names]
        relation_count = sum(1 for link in links if link.get('value') and link.get('value') != '提及')

    return {
        'success': True,
        'mode': 'relation' if relation_count > 0 else 'entity',
        'message': '已展示实体关系图谱' if relation_count > 0 else '当前仅抽取到实体，尚未形成明确关系',
        'nodes': nodes,
        'links': links,
        'categories': [{'name': '文档'}, {'name': '实体'}],
    }


def _build_similarity_graph(files_df):
    empty_result = {
        'success': True,
        'mode': 'similarity',
        'nodes': [],
        'links': [],
        'categories': [{'name': '文档'}],
    }

    if 'text_full' not in files_df.columns:
        return {
            **empty_result,
            'message': '暂无可用于构建相似度图谱的文本内容',
        }

    subset = files_df.head(20).reset_index(drop=True)
    texts = subset['text_full'].fillna('').astype(str).str.slice(0, 2000).tolist()
    if not any(text.strip() for text in texts):
        return {
            **empty_result,
            'message': '当前文件缺少可用文本，无法构建相似度图谱',
        }

    models = load_models_cached()
    vectors = np.array(models['text'].encode(texts))
    if vectors.ndim != 2 or vectors.shape[0] <= 1:
        return {
            **empty_result,
            'message': '文件数量不足，无法构建相似度图谱',
        }

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    denominator = np.matmul(norms, norms.T)
    similarity = np.divide(
        np.matmul(vectors, vectors.T),
        denominator,
        out=np.zeros((vectors.shape[0], vectors.shape[0])),
        where=denominator != 0,
    )

    nodes = []
    links = []
    for index, row in subset.iterrows():
        doc_name = _trim_label(row.get('doc_name', ''), 30) or f'文档 {index + 1}'
        nodes.append({
            'name': doc_name,
            'symbolSize': 28,
            'category': 0,
            'itemStyle': {'color': '#3b82f6'},
        })

    threshold = 0.60
    for left in range(len(nodes)):
        for right in range(left + 1, len(nodes)):
            score = float(similarity[left, right])
            if score < threshold:
                continue
            links.append({
                'source': nodes[left]['name'],
                'target': nodes[right]['name'],
                'value': f'{score:.2f}',
                'lineStyle': {
                    'width': 1.8 + score,
                    'opacity': min(0.95, 0.30 + score / 2),
                    'color': '#60a5fa',
                },
            })

    if not links:
        return {
            **empty_result,
            'message': '未检测到明显的文件相似关系',
            'nodes': nodes,
        }

    return {
        'success': True,
        'mode': 'similarity',
        'message': '当前无实体数据，已回退为文件相似度图谱',
        'nodes': nodes,
        'links': links,
        'categories': [{'name': '文档'}],
    }


@router.get('/stats', response_model=DashboardStats)
async def get_stats():
    """Get dashboard core metrics."""
    try:
        stats = get_dashboard_stats()
        text_rows = 0
        image_rows = 0
        total_files = 0
        try:
            import asyncio
            # Run LanceDB query with timeout to avoid blocking
            def _query_lancedb():
                tbl_text, tbl_image, tbl_files = get_lancedb_tables()
                return tbl_text.count_rows(), tbl_image.count_rows(), tbl_files.count_rows()

            loop = asyncio.get_event_loop()
            text_rows, image_rows, total_files = await asyncio.wait_for(
                loop.run_in_executor(None, _query_lancedb),
                timeout=5.0
            )
        except asyncio.TimeoutError:
            logger.warning('Dashboard stats timeout: LanceDB query took too long')
        except Exception as storage_error:
            logger.warning('Dashboard stats fallback to zero rows because LanceDB is unavailable: %s', storage_error)
        return DashboardStats(
            total_files=total_files,
            today_files=stats['today_files'],
            week_files=stats['week_files'],
            week_tasks_total=stats['week_tasks_total'],
            week_tasks_success=stats['week_tasks_success'],
            week_success_rate=stats['week_success_rate'],
            week_avg_time_sec=stats['week_avg_time_sec'],
            text_rows=text_rows,
            image_rows=image_rows,
        )
    except Exception as error:
        logger.error(f'获取统计数据失败: {error}', exc_info=True)
        return DashboardStats(
            total_files=0,
            today_files=0,
            week_files=0,
            week_tasks_total=0,
            week_tasks_success=0,
            week_success_rate=0,
            week_avg_time_sec=0,
            text_rows=0,
            image_rows=0,
        )


@router.get('/trend', response_model=List[TrendData])
async def get_trend(days: int = 7):
    """Get task trend."""
    try:
        trend = get_task_trend(days)
        return [TrendData(**item) for item in trend]
    except Exception as error:
        logger.error(f'获取趋势数据失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='获取趋势数据失败')


@router.get('/file-types', response_model=List[FileTypeCount])
async def get_file_types():
    """Get file-type distribution."""
    try:
        _, _, tbl_files = get_lancedb_tables()
        df = tbl_files.search().select(['doc_type']).limit(100000).to_pandas()
        if df.empty:
            return []

        type_counts = df['doc_type'].fillna('unknown').value_counts()
        return [
            FileTypeCount(doc_type=str(doc_type), count=int(count))
            for doc_type, count in type_counts.items()
        ]
    except Exception as error:
        logger.error(f'获取文件类型分布失败: {error}', exc_info=True)
        return []


@router.get('/entities', response_model=List[EntityData])
async def get_entities(file_hash: str = None):
    """Get extracted entities."""
    try:
        entities = get_file_entities(file_hash)
        return [EntityData(**entity) for entity in entities]
    except Exception as error:
        logger.error(f'获取实体数据失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='获取实体数据失败')


@router.get('/knowledge-graph', response_model=KnowledgeGraphResponse)
async def get_knowledge_graph():
    """Get knowledge-graph data, preferring entity relations over similarity."""
    try:
        _, _, tbl_files = get_lancedb_tables()
        files_df = (
            tbl_files.search()
            .select(['file_hash', 'doc_name', 'doc_type', 'source_uri', 'text_full'])
            .limit(1000)
            .to_pandas()
        )

        if files_df.empty or 'file_hash' not in files_df.columns:
            return KnowledgeGraphResponse(**_build_empty_graph())

        if 'text_full' in files_df.columns:
            files_df['text_full'] = files_df['text_full'].fillna('').apply(decode_text_from_storage)

        all_entities = get_file_entities()
        all_relations = get_file_entity_relations()
        if all_entities:
            graph = _build_entity_graph(files_df, all_entities, all_relations)
            if graph:
                return KnowledgeGraphResponse(**graph)

        graph = _build_similarity_graph(files_df)
        return KnowledgeGraphResponse(**graph)
    except Exception as error:
        logger.error(f'获取知识图谱失败: {error}', exc_info=True)
        return KnowledgeGraphResponse(**_build_empty_graph('知识图谱依赖暂不可用，已降级为空图谱'))
