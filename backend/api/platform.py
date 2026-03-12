# -*- coding: utf-8 -*-
"""Platform capability API for asset browser, Doris query studio and workflow presets."""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from database import get_app_setting, list_ingestion_jobs, save_app_setting
from models_loader import get_lancedb_tables
from text_codec import decode_text_from_storage

logger = logging.getLogger(__name__)
router = APIRouter()

PLATFORM_SETTINGS_KEY = 'platform_service_settings'
PLATFORM_EXTERNAL_TABLES_KEY = 'platform_external_tables'

DEFAULT_PLATFORM_SETTINGS = {
    'gravitino_url': 'http://192.168.11.17:8090',
    'metalake': 'demo_lake',
    'ray_dashboard_url': 'http://192.168.20.2:8265',
    'seaweedfs_master_url': 'http://192.168.20.2:9333',
    'seaweedfs_s3_url': 'http://192.168.20.4:8333',
    'doris_http_url': 'http://192.168.10.10:8030',
    'doris_mysql_host': '192.168.10.10',
    'doris_mysql_port': 9030,
    'doris_database': 'default',
    'doris_user': 'root',
    'doris_password': '',
    'use_mock': True,
}

CATALOG_BLUEPRINT = {
    'lakehouse_catalog': {
        'label': 'Lakehouse Catalog',
        'description': '面向多模态资产与 Lance 数据集的主目录',
        'schemas': {
            'multimodal': {
                'label': 'Multimodal Assets',
                'tables': [
                    {'name': 'files', 'engine': 'Lance', 'description': '多模态原始资产总表'},
                    {'name': 'text_chunks', 'engine': 'Lance', 'description': '文本切片与语义向量表'},
                    {'name': 'image_chunks', 'engine': 'Lance', 'description': '图像向量与视觉元信息表'},
                ],
            },
            'vector_db': {
                'label': 'Vector Index',
                'tables': [
                    {'name': 'semantic_search_results', 'engine': 'Service View', 'description': '向量召回结果视图'},
                    {'name': 'ingestion_jobs_view', 'engine': 'Ops View', 'description': '批量接入任务运行视图'},
                ],
            },
        },
    },
    'hive_catalog': {
        'label': 'Hive Catalog',
        'description': '用于承接原始事件与治理结果的兼容目录',
        'schemas': {
            'ods': {
                'label': 'ODS',
                'tables': [
                    {'name': 'raw_ingestion_events', 'engine': 'Mock', 'description': '来源接入事件明细'},
                    {'name': 'raw_asset_registry', 'engine': 'Mock', 'description': '资产登记原始视图'},
                ],
            },
            'ads': {
                'label': 'ADS',
                'tables': [
                    {'name': 'asset_summary_view', 'engine': 'Mock', 'description': '多模态资产汇总指标'},
                ],
            },
        },
    },
    'doris_catalog': {
        'label': 'Doris Catalog',
        'description': '联邦查询与外表映射目录',
        'schemas': {
            'federated': {
                'label': 'Federated SQL',
                'tables': [
                    {'name': 'seaweedfs_external_table', 'engine': 'Doris', 'description': 'SeaweedFS 外表示例'},
                    {'name': 'lance_vector_table', 'engine': 'Doris', 'description': 'Lance 向量外表示例'},
                ],
            },
            'query_tools': {
                'label': 'Query Tools',
                'tables': [
                    {'name': 'nl2sql_prompt_view', 'engine': 'MCP', 'description': '自然语言转 SQL 工具视图'},
                ],
            },
        },
    },
}

WORKFLOW_LIBRARY = [
    {'id': 'read_lance', 'label': '读取 Lance 数据', 'kind': 'source', 'description': '从 SeaweedFS / Lance 读取训练或检索数据'},
    {'id': 'clean_text', 'label': '文本清洗', 'kind': 'transform', 'description': '执行去噪、切片与标准化'},
    {'id': 'vectorize_text', 'label': '文本向量化', 'kind': 'ai', 'description': '使用 BERT / bge 等模型生成文本向量'},
    {'id': 'vectorize_image', 'label': '图像向量化', 'kind': 'ai', 'description': '使用 CLIP 生成图像向量'},
    {'id': 'quality_gate', 'label': '质量闸门', 'kind': 'transform', 'description': '执行质量检查和失败样本分流'},
    {'id': 'write_doris', 'label': '写入 Doris', 'kind': 'sink', 'description': '向 Doris 联邦视图或明细表回写结果'},
    {'id': 'register_gravitino', 'label': '注册元数据', 'kind': 'sink', 'description': '在 Gravitino 中登记数据资产和目录'},
]

WORKFLOW_PRESETS = [
    {
        'id': 'pdf_to_lance',
        'name': 'PDF 入湖向量化',
        'description': '适合 PDF / 文本文档的接入、清洗、向量化和元数据登记',
        'nodes': ['read_lance', 'clean_text', 'vectorize_text', 'quality_gate', 'register_gravitino'],
        'resources': {'cpu': 4, 'gpu': 0, 'memory_gb': 16},
    },
    {
        'id': 'image_to_doris',
        'name': '图像向量入 Doris',
        'description': '适合图像向量生成后写入 Doris 进行联邦检索',
        'nodes': ['read_lance', 'vectorize_image', 'quality_gate', 'write_doris', 'register_gravitino'],
        'resources': {'cpu': 6, 'gpu': 1, 'memory_gb': 24},
    },
    {
        'id': 'multimodal_training_pack',
        'name': '多模态训练包',
        'description': '围绕 SeaweedFS、Lance 和 Ray 的训练数据准备工作流',
        'nodes': ['read_lance', 'clean_text', 'vectorize_text', 'vectorize_image', 'quality_gate', 'write_doris'],
        'resources': {'cpu': 8, 'gpu': 1, 'memory_gb': 32},
    },
]


class PlatformSettingsPayload(BaseModel):
    gravitino_url: str = DEFAULT_PLATFORM_SETTINGS['gravitino_url']
    metalake: str = DEFAULT_PLATFORM_SETTINGS['metalake']
    ray_dashboard_url: str = DEFAULT_PLATFORM_SETTINGS['ray_dashboard_url']
    seaweedfs_master_url: str = DEFAULT_PLATFORM_SETTINGS['seaweedfs_master_url']
    seaweedfs_s3_url: str = DEFAULT_PLATFORM_SETTINGS['seaweedfs_s3_url']
    doris_http_url: str = DEFAULT_PLATFORM_SETTINGS['doris_http_url']
    doris_mysql_host: str = DEFAULT_PLATFORM_SETTINGS['doris_mysql_host']
    doris_mysql_port: int = DEFAULT_PLATFORM_SETTINGS['doris_mysql_port']
    doris_database: str = DEFAULT_PLATFORM_SETTINGS['doris_database']
    doris_user: str = DEFAULT_PLATFORM_SETTINGS['doris_user']
    doris_password: str = DEFAULT_PLATFORM_SETTINGS['doris_password']
    use_mock: bool = True

    @field_validator(
        'gravitino_url',
        'metalake',
        'ray_dashboard_url',
        'seaweedfs_master_url',
        'seaweedfs_s3_url',
        'doris_http_url',
        'doris_mysql_host',
        'doris_database',
        'doris_user',
        'doris_password',
        mode='before',
    )
    @classmethod
    def normalize_string(cls, value):
        return str(value or '').strip()

    @field_validator('doris_mysql_port', mode='before')
    @classmethod
    def normalize_port(cls, value):
        try:
            return max(1, min(int(value or DEFAULT_PLATFORM_SETTINGS['doris_mysql_port']), 65535))
        except Exception:
            return DEFAULT_PLATFORM_SETTINGS['doris_mysql_port']


class ExternalTablePayload(BaseModel):
    table_name: str
    source_path: str
    file_format: str = 'lance'
    catalog: str = 'doris_catalog'
    schema_name: str = Field('federated', alias='schema')
    comment: str = ''

    @field_validator('table_name', 'source_path', 'file_format', 'catalog', 'schema_name', 'comment', mode='before')
    @classmethod
    def normalize_external_strings(cls, value):
        return str(value or '').strip()


class SqlPayload(BaseModel):
    query: str
    limit: int = 20

    @field_validator('query', mode='before')
    @classmethod
    def normalize_query(cls, value):
        return str(value or '').strip()

    @field_validator('limit', mode='before')
    @classmethod
    def normalize_limit(cls, value):
        try:
            return max(1, min(int(value or 20), 200))
        except Exception:
            return 20


class NaturalLanguagePayload(BaseModel):
    prompt: str
    top_k: int = 10

    @field_validator('prompt', mode='before')
    @classmethod
    def normalize_prompt(cls, value):
        return str(value or '').strip()

    @field_validator('top_k', mode='before')
    @classmethod
    def normalize_top_k(cls, value):
        try:
            return max(1, min(int(value or 10), 50))
        except Exception:
            return 10


class WorkflowBuildPayload(BaseModel):
    name: str = 'workflow_job'
    nodes: List[str] = Field(default_factory=list)
    cpu: int = 4
    gpu: int = 0
    memory_gb: int = 16
    source_hint: str = ''

    @field_validator('name', 'source_hint', mode='before')
    @classmethod
    def normalize_workflow_strings(cls, value):
        return str(value or '').strip()

    @field_validator('nodes', mode='before')
    @classmethod
    def normalize_nodes(cls, value):
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []

    @field_validator('cpu', 'gpu', 'memory_gb', mode='before')
    @classmethod
    def normalize_positive_int(cls, value):
        try:
            return max(0, int(value or 0))
        except Exception:
            return 0


def _normalize_platform_settings(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = dict(DEFAULT_PLATFORM_SETTINGS)
    normalized.update(payload or {})
    normalized['doris_mysql_port'] = PlatformSettingsPayload(**normalized).doris_mysql_port
    normalized['use_mock'] = bool(normalized.get('use_mock', True))
    for key in normalized:
        if key == 'doris_mysql_port' or key == 'use_mock':
            continue
        normalized[key] = str(normalized.get(key, '') or '').strip()
    return normalized


def _get_platform_settings() -> Dict[str, Any]:
    return _normalize_platform_settings(get_app_setting(PLATFORM_SETTINGS_KEY, DEFAULT_PLATFORM_SETTINGS))


def _save_platform_settings(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_platform_settings(payload)
    save_app_setting(PLATFORM_SETTINGS_KEY, normalized)
    return normalized


def _get_external_tables() -> List[Dict[str, Any]]:
    saved = get_app_setting(PLATFORM_EXTERNAL_TABLES_KEY, [])
    if not isinstance(saved, list):
        return []
    normalized = []
    for item in saved:
        if not isinstance(item, dict):
            continue
        normalized.append({
            'table_name': str(item.get('table_name', '') or '').strip(),
            'source_path': str(item.get('source_path', '') or '').strip(),
            'file_format': str(item.get('file_format', 'lance') or 'lance').strip().lower(),
            'catalog': str(item.get('catalog', 'doris_catalog') or 'doris_catalog').strip(),
            'schema': str(item.get('schema', 'federated') or 'federated').strip(),
            'comment': str(item.get('comment', '') or '').strip(),
            'created_at': str(item.get('created_at', '') or '').strip(),
            'sql_preview': str(item.get('sql_preview', '') or '').strip(),
        })
    return normalized


def _extract_identifier_name(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for key in ('name', 'catalogName', 'schemaName', 'tableName'):
            value = item.get(key)
            if value:
                return str(value).strip()
        ident = item.get('identifier')
        if isinstance(ident, dict):
            return _extract_identifier_name(ident)
    return ''


def _request_gravitino(path: str) -> Optional[Dict[str, Any]]:
    settings = _get_platform_settings()
    base_url = str(settings.get('gravitino_url', '') or '').rstrip('/')
    if not base_url:
        return None

    try:
        response = requests.get(f'{base_url}{path}', timeout=3)
        response.raise_for_status()
        return response.json()
    except Exception as error:
        logger.warning('Gravitino request failed: %s %s', path, error)
        return None


def _get_live_catalog_items() -> List[Dict[str, Any]]:
    settings = _get_platform_settings()
    metalake = settings.get('metalake', 'demo_lake')
    data = _request_gravitino(f'/api/metalakes/{metalake}/catalogs')
    if not isinstance(data, dict):
        return []

    raw_items = data.get('catalogs') or data.get('identifiers') or []
    items = []
    for raw in raw_items:
        name = _extract_identifier_name(raw)
        if not name:
            continue
        items.append({
            'name': name,
            'label': name,
            'description': '来自 Gravitino 实时目录',
            'schema_count': 0,
        })
    return items


def _get_live_schema_items(catalog: str) -> List[Dict[str, Any]]:
    settings = _get_platform_settings()
    metalake = settings.get('metalake', 'demo_lake')
    data = _request_gravitino(f'/api/metalakes/{metalake}/catalogs/{catalog}/schemas')
    if not isinstance(data, dict):
        return []

    raw_items = data.get('schemas') or data.get('identifiers') or []
    items = []
    for raw in raw_items:
        name = _extract_identifier_name(raw)
        if not name:
            continue
        items.append({
            'name': name,
            'label': name,
            'description': '来自 Gravitino 实时 Schema',
        })
    return items


def _get_live_table_items(catalog: str, schema: str) -> List[Dict[str, Any]]:
    settings = _get_platform_settings()
    metalake = settings.get('metalake', 'demo_lake')
    data = _request_gravitino(f'/api/metalakes/{metalake}/catalogs/{catalog}/schemas/{schema}/tables')
    if not isinstance(data, dict):
        return []

    raw_items = data.get('tables') or data.get('identifiers') or []
    items = []
    for raw in raw_items:
        name = _extract_identifier_name(raw)
        if not name:
            continue
        items.append({
            'name': name,
            'label': name,
            'description': '来自 Gravitino 实时表目录',
            'engine': 'Gravitino',
            'row_count': _get_table_row_count(name),
        })
    return items


def _get_live_table_detail(catalog: str, schema: str, table: str) -> Optional[Dict[str, Any]]:
    settings = _get_platform_settings()
    metalake = settings.get('metalake', 'demo_lake')
    data = _request_gravitino(f'/api/metalakes/{metalake}/catalogs/{catalog}/schemas/{schema}/tables/{table}')
    if not isinstance(data, dict):
        return None

    columns = []
    for item in data.get('columns') or data.get('schema', {}).get('columns') or []:
        if isinstance(item, dict):
            columns.append({
                'name': str(item.get('name', '') or '').strip(),
                'type': str(item.get('type', '') or item.get('dataType', '') or '').strip(),
            })

    return {
        'catalog': catalog,
        'schema': schema,
        'table': table,
        'label': table,
        'description': '来自 Gravitino 实时元数据',
        'engine': 'Gravitino',
        'row_count': _get_table_row_count(table),
        'columns': columns,
        'sample_rows': _table_select_rows(table, limit=8),
        'media_samples': [],
        'storage_path': str(data.get('storage_location', '') or data.get('location', '') or f'{catalog}.{schema}.{table}'),
        'file_format': str(data.get('provider', '') or data.get('format', '') or ''),
    }


def _save_external_tables(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    save_app_setting(PLATFORM_EXTERNAL_TABLES_KEY, items)
    return items


def _trim_text(value: Any, max_length: int = 120) -> str:
    text = str(value or '').strip().replace('\n', ' ')
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + '...'


def _table_select_rows(table_name: str, limit: int = 10) -> List[Dict[str, Any]]:
    tbl_text, tbl_image, tbl_files = get_lancedb_tables()
    safe_limit = max(1, min(limit, 100))

    if table_name == 'files':
        df = (
            tbl_files.search()
            .select(['file_hash', 'doc_name', 'doc_type', 'source_uri', 'text_full'])
            .limit(safe_limit)
            .to_pandas()
        )
        rows = []
        for _, row in df.iterrows():
            rows.append({
                'file_hash': row.get('file_hash', ''),
                'doc_name': row.get('doc_name', ''),
                'doc_type': row.get('doc_type', ''),
                'source_uri': row.get('source_uri', ''),
                'text_preview': _trim_text(decode_text_from_storage(row.get('text_full', '')), 140),
            })
        return rows

    if table_name == 'text_chunks':
        df = (
            tbl_text.search()
            .select(['id', 'doc_name', 'doc_type', 'source_uri', 'file_hash', 'text'])
            .limit(safe_limit)
            .to_pandas()
        )
        rows = []
        for _, row in df.iterrows():
            rows.append({
                'id': row.get('id', ''),
                'doc_name': row.get('doc_name', ''),
                'doc_type': row.get('doc_type', ''),
                'source_uri': row.get('source_uri', ''),
                'file_hash': row.get('file_hash', ''),
                'text': _trim_text(decode_text_from_storage(row.get('text', '')), 140),
            })
        return rows

    if table_name == 'image_chunks':
        df = (
            tbl_image.search()
            .select(['id', 'doc_name', 'source_uri', 'meta_info', 'file_hash'])
            .limit(safe_limit)
            .to_pandas()
        )
        rows = []
        for _, row in df.iterrows():
            rows.append({
                'id': row.get('id', ''),
                'doc_name': row.get('doc_name', ''),
                'source_uri': row.get('source_uri', ''),
                'meta_info': row.get('meta_info', ''),
                'file_hash': row.get('file_hash', ''),
            })
        return rows

    if table_name == 'ingestion_jobs_view':
        jobs = list_ingestion_jobs(limit=safe_limit)
        return [
            {
                'job_id': item.get('job_id', ''),
                'status': item.get('status', ''),
                'message': item.get('message', ''),
                'updated_at': item.get('updated_at', ''),
            }
            for item in jobs
        ]

    if table_name == 'semantic_search_results':
        return [
            {'query': '多模态图片检索', 'top_k': 10, 'engine': 'Lance + Vector Search', 'note': '使用当前向量检索服务'},
            {'query': 'PDF 文档摘要召回', 'top_k': 5, 'engine': 'Text Embedding', 'note': '服务端实时生成'},
        ]

    if table_name == 'raw_ingestion_events':
        return [
            {'event_time': '2026-03-12 10:12:00', 'source': 'seaweedfs_s3', 'action': 'scan', 'status': 'success'},
            {'event_time': '2026-03-12 10:13:20', 'source': 'sftp', 'action': 'ingest_job', 'status': 'running'},
        ]

    if table_name == 'raw_asset_registry':
        rows = _table_select_rows('files', limit=safe_limit)
        return [
            {
                'asset_name': item.get('doc_name', ''),
                'asset_type': item.get('doc_type', ''),
                'source_uri': item.get('source_uri', ''),
                'file_hash': item.get('file_hash', ''),
            }
            for item in rows
        ]

    if table_name == 'asset_summary_view':
        files_rows = _table_select_rows('files', limit=50)
        summary = {}
        for row in files_rows:
            doc_type = str(row.get('doc_type', 'unknown') or 'unknown')
            summary[doc_type] = summary.get(doc_type, 0) + 1
        return [{'doc_type': key, 'asset_count': value} for key, value in summary.items()]

    if table_name == 'seaweedfs_external_table':
        return [
            {'table_name': 'seaweedfs_external_table', 'format': 'parquet', 'path': 'seaweedfs://multimodal/raw'},
        ]

    if table_name == 'lance_vector_table':
        return [
            {'table_name': 'lance_vector_table', 'format': 'lance', 'path': 'seaweedfs://multimodal/lance_vectors'},
        ]

    if table_name == 'nl2sql_prompt_view':
        return [
            {'prompt': '查询最近导入的图片资产', 'generated_sql': "SELECT doc_name, doc_type FROM files WHERE doc_type IN ('jpg','png') LIMIT 20;"},
            {'prompt': '展示最近任务状态', 'generated_sql': 'SELECT job_id, status, updated_at FROM ingestion_jobs_view LIMIT 20;'},
        ]

    return []


def _get_table_row_count(table_name: str) -> int:
    try:
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        if table_name == 'files':
            return int(tbl_files.count_rows())
        if table_name == 'text_chunks':
            return int(tbl_text.count_rows())
        if table_name == 'image_chunks':
            return int(tbl_image.count_rows())
        if table_name == 'ingestion_jobs_view':
            return len(list_ingestion_jobs(limit=100))
    except Exception as error:
        logger.warning('读取表行数失败: %s', error)
    return len(_table_select_rows(table_name, limit=50))


def _get_table_schema(table_name: str) -> List[Dict[str, str]]:
    tbl_text, tbl_image, tbl_files = get_lancedb_tables()
    schema_map = {
        'files': tbl_files.schema,
        'text_chunks': tbl_text.schema,
        'image_chunks': tbl_image.schema,
    }
    if table_name in schema_map:
        schema = schema_map[table_name]
        return [{'name': field.name, 'type': str(field.type)} for field in schema]

    sample_rows = _table_select_rows(table_name, limit=1)
    if not sample_rows:
        return []
    return [{'name': key, 'type': type(value).__name__} for key, value in sample_rows[0].items()]


def _flatten_table_blueprint() -> Dict[str, Dict[str, Any]]:
    flattened = {}
    for catalog_name, catalog_info in CATALOG_BLUEPRINT.items():
        for schema_name, schema_info in catalog_info['schemas'].items():
            for table in schema_info['tables']:
                flattened[table['name']] = {
                    'catalog': catalog_name,
                    'schema': schema_name,
                    **table,
                }

    for item in _get_external_tables():
        flattened[item['table_name']] = {
            'catalog': item['catalog'],
            'schema': item['schema'],
            'name': item['table_name'],
            'engine': 'Doris External',
            'description': item['comment'] or '用户创建的 Doris 外表',
            'source_path': item['source_path'],
            'file_format': item['file_format'],
        }
    return flattened


def _extract_limit_from_sql(query: str, fallback: int = 20) -> int:
    match = re.search(r'limit\s+(\d+)', query, flags=re.IGNORECASE)
    if not match:
        return fallback
    try:
        return max(1, min(int(match.group(1)), 200))
    except Exception:
        return fallback


def _resolve_sql_table(query: str) -> str:
    match = re.search(r'from\s+([a-zA-Z0-9_\.]+)', query, flags=re.IGNORECASE)
    if not match:
        return ''
    table_name = match.group(1).split('.')[-1]
    return table_name.strip()


def _generate_external_table_sql(item: Dict[str, Any]) -> str:
    table_name = item['table_name']
    schema_name = item['schema']
    file_format = item['file_format']
    source_path = item['source_path']
    return (
        f"CREATE EXTERNAL TABLE {schema_name}.{table_name} (\n"
        "  file_hash STRING,\n"
        "  doc_name STRING,\n"
        "  doc_type STRING,\n"
        "  source_uri STRING\n"
        ")\n"
        "ENGINE=DORIS\n"
        "PROPERTIES (\n"
        f"  \"format\" = \"{file_format}\",\n"
        f"  \"path\" = \"{source_path}\"\n"
        ");"
    )


def _create_external_table_item(payload: ExternalTablePayload) -> Dict[str, Any]:
    item = {
        'table_name': payload.table_name,
        'source_path': payload.source_path,
        'file_format': payload.file_format.lower(),
        'catalog': payload.catalog,
        'schema': payload.schema_name,
        'comment': payload.comment,
        'created_at': datetime.now().isoformat(timespec='seconds'),
    }
    item['sql_preview'] = _generate_external_table_sql(item)
    return item


@router.get('/settings')
async def get_platform_settings():
    settings = _get_platform_settings()
    return {
        'success': True,
        'message': 'ok',
        'data': {
            **settings,
            'external_tables': _get_external_tables(),
            'reference_summary': {
                'platform_name': '多模态数据湖统一管理平台',
                'focus': ['Gravitino 目录管理', 'SeaweedFS + Lance 存储', 'Ray 编排', 'Doris 联邦查询'],
            },
        },
    }


@router.post('/settings')
async def save_platform_settings(payload: PlatformSettingsPayload):
    settings = _save_platform_settings(payload.model_dump())
    return {'success': True, 'message': '平台配置已保存', 'data': settings}


@router.get('/assets/catalogs')
async def get_asset_catalogs():
    live_items = _get_live_catalog_items()
    if live_items:
        return {'success': True, 'items': live_items}

    catalogs = []
    for name, info in CATALOG_BLUEPRINT.items():
        catalogs.append({
            'name': name,
            'label': info['label'],
            'description': info['description'],
            'schema_count': len(info['schemas']),
        })
    return {'success': True, 'items': catalogs}


@router.get('/assets/schemas')
async def get_asset_schemas(catalog: str):
    live_items = _get_live_schema_items(catalog)
    if live_items:
        return {'success': True, 'items': live_items}

    catalog_info = CATALOG_BLUEPRINT.get(catalog)
    if not catalog_info:
        raise HTTPException(status_code=404, detail='Catalog 不存在')
    items = []
    for name, info in catalog_info['schemas'].items():
        items.append({
            'name': name,
            'label': info['label'],
            'description': f"{len(info['tables'])} 个表",
        })
    return {'success': True, 'items': items}


@router.get('/assets/tables')
async def get_asset_tables(catalog: str, schema: str):
    live_items = _get_live_table_items(catalog, schema)
    if live_items:
        return {'success': True, 'items': live_items}

    catalog_info = CATALOG_BLUEPRINT.get(catalog)
    if not catalog_info or schema not in catalog_info['schemas']:
        raise HTTPException(status_code=404, detail='Schema 不存在')

    items = []
    for table in catalog_info['schemas'][schema]['tables']:
        items.append({
            'name': table['name'],
            'label': table['name'],
            'description': table['description'],
            'engine': table['engine'],
            'row_count': _get_table_row_count(table['name']),
        })

    for external in _get_external_tables():
        if external['catalog'] == catalog and external['schema'] == schema:
            items.append({
                'name': external['table_name'],
                'label': external['table_name'],
                'description': external['comment'] or '用户创建的外表',
                'engine': 'Doris External',
                'row_count': _get_table_row_count(external['table_name']),
            })

    return {'success': True, 'items': items}


@router.get('/assets/detail')
async def get_asset_detail(catalog: str, schema: str, table: str, limit: int = 8):
    table_meta = _flatten_table_blueprint().get(table)
    if not table_meta:
        live_detail = _get_live_table_detail(catalog, schema, table)
        if live_detail:
            return {'success': True, 'data': live_detail}
        raise HTTPException(status_code=404, detail='Table 不存在')

    sample_rows = _table_select_rows(table, limit=max(1, min(limit, 20)))
    media_samples = []
    if table == 'files':
        for row in sample_rows:
            doc_type = str(row.get('doc_type', '')).lower()
            if doc_type in {'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf', 'txt', 'docx', 'pptx'}:
                media_samples.append({
                    'file_hash': row.get('file_hash', ''),
                    'doc_name': row.get('doc_name', ''),
                    'doc_type': row.get('doc_type', ''),
                })
            if len(media_samples) >= 4:
                break

    return {
        'success': True,
        'data': {
            'catalog': catalog,
            'schema': schema,
            'table': table,
            'label': table_meta.get('label', table),
            'description': table_meta.get('description', ''),
            'engine': table_meta.get('engine', 'Mock'),
            'row_count': _get_table_row_count(table),
            'columns': _get_table_schema(table),
            'sample_rows': sample_rows,
            'media_samples': media_samples,
            'storage_path': table_meta.get('source_path') or f"{catalog}.{schema}.{table}",
            'file_format': table_meta.get('file_format', ''),
        },
    }


@router.get('/doris/external-tables')
async def list_external_tables():
    return {'success': True, 'items': _get_external_tables()}


@router.post('/doris/test-connection')
async def test_doris_connection(payload: PlatformSettingsPayload):
    settings = _normalize_platform_settings(payload.model_dump())
    try:
        import pymysql

        conn = pymysql.connect(
            host=settings['doris_mysql_host'],
            port=settings['doris_mysql_port'],
            user=settings['doris_user'],
            password=settings['doris_password'],
            database=settings['doris_database'] or None,
            connect_timeout=3,
            read_timeout=3,
            write_timeout=3,
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute('SELECT VERSION()')
                version = cursor.fetchone()
        finally:
            conn.close()
        return {
            'success': True,
            'connected': True,
            'mode': 'live',
            'message': f"Doris 连接成功，版本：{version[0] if version else 'unknown'}",
        }
    except Exception as error:
        logger.warning('Doris 连接失败，回退 Mock: %s', error)
        return {
            'success': True,
            'connected': False,
            'mode': 'mock' if settings.get('use_mock', True) else 'error',
            'message': f"Doris 实连失败，当前回退为 Mock 模式：{error}",
        }


@router.post('/doris/external-tables')
async def create_external_table(payload: ExternalTablePayload):
    if not payload.table_name:
        raise HTTPException(status_code=400, detail='外表名称不能为空')
    if not payload.source_path:
        raise HTTPException(status_code=400, detail='外表路径不能为空')

    items = [item for item in _get_external_tables() if item['table_name'] != payload.table_name]
    item = _create_external_table_item(payload)
    items.append(item)
    _save_external_tables(items)
    return {'success': True, 'message': '外表定义已保存', 'data': item}


@router.post('/doris/sql')
async def execute_sql(payload: SqlPayload):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail='SQL 不能为空')

    query_lower = query.lower()
    if query_lower.startswith('show catalogs'):
        rows = [{'catalog_name': key, 'description': value['description']} for key, value in CATALOG_BLUEPRINT.items()]
        return {'success': True, 'mode': 'mock', 'columns': ['catalog_name', 'description'], 'rows': rows, 'message': '已返回目录列表'}

    if query_lower.startswith('show schemas'):
        rows = []
        for catalog_name, catalog_info in CATALOG_BLUEPRINT.items():
            for schema_name in catalog_info['schemas']:
                rows.append({'catalog_name': catalog_name, 'schema_name': schema_name})
        return {'success': True, 'mode': 'mock', 'columns': ['catalog_name', 'schema_name'], 'rows': rows, 'message': '已返回 Schema 列表'}

    if query_lower.startswith('show tables'):
        rows = []
        for table_name, meta in _flatten_table_blueprint().items():
            rows.append({
                'catalog_name': meta['catalog'],
                'schema_name': meta['schema'],
                'table_name': table_name,
                'engine': meta.get('engine', 'Mock'),
            })
        return {'success': True, 'mode': 'mock', 'columns': ['catalog_name', 'schema_name', 'table_name', 'engine'], 'rows': rows, 'message': '已返回表列表'}

    table_name = _resolve_sql_table(query)
    if table_name:
        limit = _extract_limit_from_sql(query, payload.limit)
        rows = _table_select_rows(table_name, limit=limit)
        columns = list(rows[0].keys()) if rows else []
        if rows:
            return {
                'success': True,
                'mode': 'local',
                'columns': columns,
                'rows': rows,
                'message': f'已基于当前本地数据返回 {len(rows)} 行结果',
            }

    rows = [
        {'query': query, 'status': 'mock', 'note': '当前 SQL 未命中本地表，已返回 Mock 结果'},
    ]
    return {'success': True, 'mode': 'mock', 'columns': ['query', 'status', 'note'], 'rows': rows, 'message': '当前为 Mock 执行结果'}


def _guess_sql_from_prompt(prompt: str) -> str:
    text = prompt.strip()
    if not text:
        return 'SELECT file_hash, doc_name, doc_type, source_uri FROM files LIMIT 20;'

    if any(keyword in text for keyword in ['图片', '图像', '照片']):
        return "SELECT file_hash, doc_name, doc_type, source_uri FROM files WHERE doc_type IN ('jpg', 'jpeg', 'png', 'webp') LIMIT 20;"

    if any(keyword in text for keyword in ['文档', 'pdf', 'PDF', '文本']):
        return "SELECT file_hash, doc_name, doc_type, source_uri FROM files WHERE doc_type IN ('pdf', 'txt', 'docx', 'pptx') LIMIT 20;"

    if any(keyword in text for keyword in ['任务', '作业', '批量导入']):
        return 'SELECT job_id, status, message, updated_at FROM ingestion_jobs_view LIMIT 20;'

    if any(keyword in text for keyword in ['索引', '向量表']):
        return 'SHOW TABLES;'

    return 'SELECT file_hash, doc_name, doc_type, source_uri FROM files LIMIT 20;'


@router.post('/doris/nl2sql')
async def nl_to_sql(payload: NaturalLanguagePayload):
    sql = _guess_sql_from_prompt(payload.prompt)
    reasoning = '已根据关键词将自然语言映射到本地可执行的演示 SQL。'
    return {'success': True, 'sql': sql, 'reasoning': reasoning}


@router.post('/doris/nl2vector')
async def nl_to_vector(payload: NaturalLanguagePayload):
    prompt = payload.prompt.strip()
    mode = 'image' if any(keyword in prompt for keyword in ['图片', '图像', '照片']) else 'text'
    return {
        'success': True,
        'data': {
            'mode': mode,
            'top_k': payload.top_k,
            'query': prompt or '多模态数据湖',
            'command_text': f"vector_search(mode='{mode}', top_k={payload.top_k}, query='{prompt or '多模态数据湖'}')",
        },
    }


@router.get('/workflow/presets')
async def get_workflow_presets():
    return {'success': True, 'library': WORKFLOW_LIBRARY, 'presets': WORKFLOW_PRESETS}


@router.post('/workflow/build-job')
async def build_workflow_job(payload: WorkflowBuildPayload):
    if not payload.nodes:
        raise HTTPException(status_code=400, detail='工作流至少需要一个节点')

    node_labels = []
    for node_id in payload.nodes:
        match = next((item for item in WORKFLOW_LIBRARY if item['id'] == node_id), None)
        node_labels.append(match['label'] if match else node_id)

    entrypoint = (
        f"python workflow_runner.py --name {payload.name or 'workflow_job'} "
        f"--nodes {' '.join(payload.nodes)} "
        f"--cpu {max(1, payload.cpu)} --gpu {max(0, payload.gpu)} --memory-gb {max(1, payload.memory_gb)}"
    )
    runtime_env = {
        'working_dir': './ray_jobs',
        'env_vars': {
            'SOURCE_HINT': payload.source_hint or 'seaweedfs://multimodal',
            'WORKFLOW_NAME': payload.name or 'workflow_job',
        },
        'pip': ['ray[default]', 'daft', 'lance', 'pyarrow'],
    }
    return {
        'success': True,
        'data': {
            'entrypoint': entrypoint,
            'runtime_env': runtime_env,
            'resource_hint': {'cpu': payload.cpu, 'gpu': payload.gpu, 'memory_gb': payload.memory_gb},
            'node_labels': node_labels,
            'summary': f"工作流包含 {len(node_labels)} 个节点：{' → '.join(node_labels)}",
        },
    }
