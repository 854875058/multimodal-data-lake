# -*- coding: utf-8 -*-
"""Ingestion workbench service for S3/SFTP scan, batch import and index building."""

import math
import os
import posixpath
import shutil
import stat
import threading
import traceback
import uuid
import warnings
from datetime import datetime

import boto3
from botocore.config import Config as BotoConfig

from config import ARCHIVE_EXTS, CONTENT_EXTS, IMAGE_EXTS, S3_CONFIG, TEMP_DIR
from database import (
    append_ingestion_job_log,
    check_file_exists,
    create_ingestion_job,
    get_app_setting,
    get_ingestion_job,
    list_ingestion_jobs,
    save_app_setting,
    update_ingestion_job,
)
from etl import extract_content, extract_entities_llm, process_pipeline
from models_loader import get_lancedb_tables, load_models_cached

SUPPORTED_EXTENSIONS = sorted(set(CONTENT_EXTS + IMAGE_EXTS + ARCHIVE_EXTS))
SUPPORTED_INDEX_TYPES = (
    'IVF_FLAT',
    'IVF_SQ',
    'IVF_PQ',
    'IVF_RQ',
    'IVF_HNSW_SQ',
    'IVF_HNSW_PQ',
)
DEFAULT_WORKBENCH_SETTINGS = {
    'source_type': 's3',
    'endpoint_url': S3_CONFIG.get('endpoint_url', ''),
    'access_key_id': S3_CONFIG.get('access_key_id', ''),
    'secret_access_key': S3_CONFIG.get('secret_access_key', ''),
    'bucket_name': S3_CONFIG.get('raw_bucket') or S3_CONFIG.get('bucket_name', ''),
    'prefix': '',
    'sftp_host': '',
    'sftp_port': 22,
    'sftp_user': '',
    'sftp_password': '',
    'sftp_path': '/tmp',
    'scan_limit': 200,
    'max_files': 100,
    'overwrite_existing': False,
    'index_strategy': 'auto',
    'index_type': 'IVF_PQ',
    'build_text_index': True,
    'build_image_index': True,
    'num_partitions': None,
    'num_sub_vectors': None,
}
WORKBENCH_SETTINGS_KEY = 'ingestion_workbench_settings'
RUNTIME_ONLY_KEYS = {'selected_keys'}


def _normalize_payload(payload):
    normalized = dict(DEFAULT_WORKBENCH_SETTINGS)
    normalized.update(payload or {})
    source_type = str(normalized.get('source_type', 's3') or 's3').strip().lower()
    normalized['source_type'] = source_type if source_type in {'s3', 'sftp'} else 's3'
    normalized['endpoint_url'] = str(normalized.get('endpoint_url', '') or '').strip()
    normalized['access_key_id'] = str(normalized.get('access_key_id', '') or '').strip()
    normalized['secret_access_key'] = str(normalized.get('secret_access_key', '') or '').strip()
    normalized['bucket_name'] = str(normalized.get('bucket_name', '') or '').strip()
    normalized['prefix'] = str(normalized.get('prefix', '') or '').strip().lstrip('/')
    normalized['sftp_host'] = str(normalized.get('sftp_host', '') or '').strip()
    normalized['sftp_user'] = str(normalized.get('sftp_user', '') or '').strip()
    normalized['sftp_password'] = str(normalized.get('sftp_password', '') or '').strip()
    normalized['sftp_path'] = str(normalized.get('sftp_path', '') or '').strip() or '/'
    try:
        normalized['sftp_port'] = int(normalized.get('sftp_port') or DEFAULT_WORKBENCH_SETTINGS['sftp_port'])
    except (TypeError, ValueError):
        normalized['sftp_port'] = DEFAULT_WORKBENCH_SETTINGS['sftp_port']
    normalized['sftp_port'] = max(1, min(normalized['sftp_port'], 65535))
    normalized['scan_limit'] = max(1, min(int(normalized.get('scan_limit') or 200), 2000))
    normalized['max_files'] = max(1, min(int(normalized.get('max_files') or 100), 5000))
    normalized['overwrite_existing'] = bool(normalized.get('overwrite_existing', False))
    normalized['index_strategy'] = str(normalized.get('index_strategy', 'auto') or 'auto').strip().lower()
    raw_index_type = normalized.get('index_type')
    normalized['index_type'] = str(raw_index_type or '').strip().upper()
    normalized['build_text_index'] = bool(normalized.get('build_text_index', True))
    normalized['build_image_index'] = bool(normalized.get('build_image_index', True))
    num_partitions = normalized.get('num_partitions')
    num_sub_vectors = normalized.get('num_sub_vectors')
    normalized['num_partitions'] = int(num_partitions) if num_partitions not in (None, '', 0, '0') else None
    normalized['num_sub_vectors'] = int(num_sub_vectors) if num_sub_vectors not in (None, '', 0, '0') else None
    raw_selected_keys = normalized.get('selected_keys')
    if isinstance(raw_selected_keys, list):
        selected_keys = []
        seen_keys = set()
        for item in raw_selected_keys:
            normalized_key = str(item or '').strip()
            if not normalized_key or normalized_key in seen_keys:
                continue
            seen_keys.add(normalized_key)
            selected_keys.append(normalized_key)
        normalized['selected_keys'] = selected_keys
    else:
        normalized['selected_keys'] = []
    return normalized



def get_workbench_settings():
    saved = get_app_setting(WORKBENCH_SETTINGS_KEY, DEFAULT_WORKBENCH_SETTINGS)
    return _normalize_payload(saved)



def save_workbench_settings(payload):
    normalized = _normalize_payload(payload)
    persistable = {key: value for key, value in normalized.items() if key not in RUNTIME_ONLY_KEYS}
    save_app_setting(WORKBENCH_SETTINGS_KEY, persistable)
    return normalized



def _validate_s3_payload(payload):
    required_fields = ['endpoint_url', 'access_key_id', 'secret_access_key', 'bucket_name']
    missing = [field for field in required_fields if not payload.get(field)]
    if missing:
        raise ValueError(f"缺少必要配置: {', '.join(missing)}")


def _validate_sftp_payload(payload):
    required_fields = ['sftp_host', 'sftp_user', 'sftp_password', 'sftp_path']
    missing = [field for field in required_fields if not payload.get(field)]
    if missing:
        raise ValueError(f"缺少必要配置: {', '.join(missing)}")


def _get_paramiko():
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                'ignore',
                message='.*TripleDES has been moved.*',
                module='paramiko',
            )
            warnings.filterwarnings(
                'ignore',
                message='.*Blowfish has been moved.*',
                module='paramiko',
            )
            import paramiko
    except ImportError as error:
        raise RuntimeError('当前环境未安装 paramiko，无法使用 SFTP 接入') from error

    return paramiko



def _create_s3_client(payload):
    _validate_s3_payload(payload)
    return boto3.client(
        's3',
        endpoint_url=payload['endpoint_url'],
        aws_access_key_id=payload['access_key_id'],
        aws_secret_access_key=payload['secret_access_key'],
        config=BotoConfig(s3={'addressing_style': 'path'}),
    )


def _create_sftp_client(payload):
    _validate_sftp_payload(payload)
    paramiko = _get_paramiko()
    transport = paramiko.Transport((payload['sftp_host'], int(payload['sftp_port'])))
    transport.connect(username=payload['sftp_user'], password=payload['sftp_password'])
    client = paramiko.SFTPClient.from_transport(transport)
    return transport, client


def _display_name_from_key(key):
    normalized_key = str(key or '').replace('\\', '/')
    return normalized_key.rsplit('/', 1)[-1] if normalized_key else ''



def _detect_extension(key):
    name = _display_name_from_key(key)
    return name.rsplit('.', 1)[-1].lower() if '.' in name else ''



def _detect_category(ext):
    if ext in IMAGE_EXTS:
        return 'image'
    if ext in ARCHIVE_EXTS:
        return 'archive'
    if ext in CONTENT_EXTS:
        if ext in {'mp3', 'wav', 'm4a', 'flac', 'ogg'}:
            return 'audio'
        if ext in {'mp4', 'avi', 'mov', 'mkv', 'webm'}:
            return 'video'
        return 'text'
    return 'other'



def _is_supported_key(key):
    return _detect_extension(key) in SUPPORTED_EXTENSIONS



def _get_source_label(payload):
    return payload['bucket_name'] if payload.get('source_type') == 's3' else payload['sftp_host']


def _get_source_path(payload):
    return payload.get('prefix', '') if payload.get('source_type') == 's3' else payload.get('sftp_path', '/')


def _describe_source(payload):
    if payload.get('source_type') == 'sftp':
        return f"SFTP host={payload['sftp_host']} path={payload['sftp_path'] or '/'}"
    return f"S3 bucket={payload['bucket_name']} prefix={payload['prefix'] or '/'}"


def _build_scan_result(payload, objects, total_seen, truncated):
    supported_count = sum(1 for obj in objects if obj['supported'])
    result = {
        'source_type': payload['source_type'],
        'source_label': _get_source_label(payload),
        'source_path': _get_source_path(payload),
        'objects': objects,
        'returned_count': len(objects),
        'eligible_count': supported_count,
        'total_seen': total_seen,
        'truncated': truncated,
    }
    if payload.get('source_type') == 'sftp':
        result['host'] = payload['sftp_host']
        result['path'] = payload['sftp_path']
    else:
        result['bucket_name'] = payload['bucket_name']
        result['prefix'] = payload['prefix']
    return result


def _build_connection_result(payload, sample, message):
    result = {
        'success': True,
        'source_type': payload['source_type'],
        'source_label': _get_source_label(payload),
        'source_path': _get_source_path(payload),
        'sample_count': len(sample),
        'sample_objects': sample,
        'message': message,
    }
    if payload.get('source_type') == 'sftp':
        result['host'] = payload['sftp_host']
        result['path'] = payload['sftp_path']
    else:
        result['bucket_name'] = payload['bucket_name']
        result['prefix'] = payload['prefix']
    return result


def _list_s3_objects(payload):
    client = _create_s3_client(payload)
    paginator = client.get_paginator('list_objects_v2')
    objects = []
    total_seen = 0
    request_kwargs = {'Bucket': payload['bucket_name']}
    if payload['prefix']:
        request_kwargs['Prefix'] = payload['prefix']

    for page in paginator.paginate(**request_kwargs):
        for item in page.get('Contents', []):
            key = item.get('Key', '')
            if not key or key.endswith('/'):
                continue
            total_seen += 1
            ext = _detect_extension(key)
            objects.append({
                'key': key,
                'name': _display_name_from_key(key),
                'size': int(item.get('Size', 0) or 0),
                'last_modified': item.get('LastModified').isoformat() if item.get('LastModified') else '',
                'ext': ext,
                'category': _detect_category(ext),
                'supported': ext in SUPPORTED_EXTENSIONS,
            })
            if len(objects) >= payload['scan_limit']:
                return _build_scan_result(payload, objects, total_seen, True)

    return _build_scan_result(payload, objects, total_seen, False)


def _join_sftp_path(base_path, filename):
    normalized_base = str(base_path or '').strip()
    if normalized_base in {'', '/'}:
        return f'/{filename}'
    return posixpath.join(normalized_base.rstrip('/'), filename)


def _list_sftp_objects(payload):
    transport = None
    client = None
    objects = []
    total_seen = 0
    try:
        transport, client = _create_sftp_client(payload)
        for item in sorted(client.listdir_attr(payload['sftp_path']), key=lambda value: value.filename.lower()):
            if not item.filename or item.filename.startswith('.'):
                continue
            if stat.S_ISDIR(item.st_mode):
                continue
            key = _join_sftp_path(payload['sftp_path'], item.filename)
            total_seen += 1
            ext = _detect_extension(key)
            objects.append({
                'key': key,
                'name': item.filename,
                'size': int(getattr(item, 'st_size', 0) or 0),
                'last_modified': datetime.fromtimestamp(item.st_mtime).isoformat() if getattr(item, 'st_mtime', None) else '',
                'ext': ext,
                'category': _detect_category(ext),
                'supported': ext in SUPPORTED_EXTENSIONS,
            })
            if len(objects) >= payload['scan_limit']:
                return _build_scan_result(payload, objects, total_seen, True)
        return _build_scan_result(payload, objects, total_seen, False)
    finally:
        if client is not None:
            client.close()
        if transport is not None:
            transport.close()


def list_source_objects(payload):
    normalized = _normalize_payload(payload)
    if normalized['source_type'] == 'sftp':
        return _list_sftp_objects(normalized)
    return _list_s3_objects(normalized)



def test_source_connection(payload):
    normalized = _normalize_payload(payload)
    if normalized['source_type'] == 'sftp':
        transport = None
        client = None
        try:
            transport, client = _create_sftp_client(normalized)
            sample = []
            for item in sorted(client.listdir_attr(normalized['sftp_path']), key=lambda value: value.filename.lower()):
                if not item.filename or item.filename.startswith('.') or stat.S_ISDIR(item.st_mode):
                    continue
                key = _join_sftp_path(normalized['sftp_path'], item.filename)
                sample.append({
                    'key': key,
                    'size': int(getattr(item, 'st_size', 0) or 0),
                    'ext': _detect_extension(key),
                    'supported': _is_supported_key(key),
                })
                if len(sample) >= 5:
                    break
            return _build_connection_result(normalized, sample, 'SFTP 连接成功')
        finally:
            if client is not None:
                client.close()
            if transport is not None:
                transport.close()

    client = _create_s3_client(normalized)
    request_kwargs = {'Bucket': normalized['bucket_name'], 'MaxKeys': 5}
    if normalized['prefix']:
        request_kwargs['Prefix'] = normalized['prefix']
    response = client.list_objects_v2(**request_kwargs)
    sample = []
    for item in response.get('Contents', []):
        key = item.get('Key', '')
        if not key or key.endswith('/'):
            continue
        sample.append({
            'key': key,
            'size': int(item.get('Size', 0) or 0),
            'ext': _detect_extension(key),
            'supported': _is_supported_key(key),
        })
    return _build_connection_result(normalized, sample, 'S3 连接成功')



def _resolve_index_type(payload, row_count):
    strategy = payload.get('index_strategy', 'auto')
    explicit_type = str(payload.get('index_type', '') or '').strip().upper()
    if strategy == 'none':
        return None
    if strategy == 'auto':
        return 'IVF_PQ' if row_count >= 256 else 'IVF_FLAT'
    return explicit_type or None



def _resolve_num_partitions(payload, row_count):
    if payload.get('num_partitions'):
        return int(payload['num_partitions'])
    if row_count <= 0:
        return 1
    return max(1, min(256, int(math.sqrt(row_count)) or 1))



def _resolve_num_sub_vectors(payload, index_type):
    if 'PQ' not in index_type:
        return None
    if payload.get('num_sub_vectors'):
        return int(payload['num_sub_vectors'])
    return 16



def _serialize_index_item(item):
    if isinstance(item, (str, int, float, bool)) or item is None:
        return item
    if isinstance(item, dict):
        return {key: _serialize_index_item(value) for key, value in item.items()}
    if isinstance(item, (list, tuple, set)):
        return [_serialize_index_item(value) for value in item]
    if hasattr(item, 'to_dict'):
        return _serialize_index_item(item.to_dict())
    if hasattr(item, '__dict__'):
        return {key: _serialize_index_item(value) for key, value in vars(item).items() if not key.startswith('_')}
    return str(item)


def get_index_status():
    tbl_text, tbl_image, _ = get_lancedb_tables()
    return {
        'text': {
            'row_count': tbl_text.count_rows(),
            'indices': _serialize_index_item(tbl_text.list_indices()),
        },
        'image': {
            'row_count': tbl_image.count_rows(),
            'indices': _serialize_index_item(tbl_image.list_indices()),
        },
    }



def build_vector_indices(payload, log_callback=None):
    normalized = _normalize_payload(payload)
    tbl_text, tbl_image, _ = get_lancedb_tables()
    results = []

    for table_name, table, enabled in [
        ('text', tbl_text, normalized.get('build_text_index', True)),
        ('image', tbl_image, normalized.get('build_image_index', True)),
    ]:
        if not enabled:
            results.append({'table': table_name, 'status': 'skipped', 'reason': 'disabled'})
            continue

        row_count = table.count_rows()
        index_type = _resolve_index_type(normalized, row_count)
        if not index_type:
            reason = 'empty_index_type' if normalized.get('index_strategy') == 'custom' else 'index_disabled'
            results.append({'table': table_name, 'status': 'skipped', 'reason': reason})
            continue
        if index_type not in SUPPORTED_INDEX_TYPES:
            raise ValueError(f'不支持的索引类型: {index_type}')
        if row_count <= 0:
            results.append({'table': table_name, 'status': 'skipped', 'reason': 'empty_table'})
            continue

        options = {
            'index_type': index_type,
            'metric': 'cosine',
            'replace': True,
            'num_partitions': _resolve_num_partitions(normalized, row_count),
        }
        num_sub_vectors = _resolve_num_sub_vectors(normalized, index_type)
        if num_sub_vectors is not None:
            options['num_sub_vectors'] = num_sub_vectors

        if log_callback:
            log_callback(f"[INDEX] 开始构建 {table_name} 向量索引: type={index_type}, rows={row_count}, options={options}")

        table.create_index(**options)
        indices = _serialize_index_item(table.list_indices())
        result = {
            'table': table_name,
            'status': 'built',
            'index_type': index_type,
            'row_count': row_count,
            'indices': indices,
        }
        results.append(result)

        if log_callback:
            log_callback(f"[INDEX] {table_name} 索引构建完成，共 {len(indices)} 个索引")

    return results



def _download_s3_object(client, bucket_name, key, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    client.download_file(bucket_name, key, local_path)


def _download_sftp_object(client, key, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    client.get(key, local_path)


def _open_source_session(payload):
    if payload.get('source_type') == 'sftp':
        transport, client = _create_sftp_client(payload)
        return {'type': 'sftp', 'client': client, 'transport': transport}
    return {'type': 's3', 'client': _create_s3_client(payload), 'transport': None}


def _close_source_session(source_session):
    if not source_session:
        return
    client = source_session.get('client')
    transport = source_session.get('transport')
    if source_session.get('type') == 'sftp' and client is not None:
        client.close()
    if transport is not None:
        transport.close()


def _download_source_object(source_session, payload, key, local_path):
    if source_session.get('type') == 'sftp':
        _download_sftp_object(source_session['client'], key, local_path)
        return
    _download_s3_object(source_session['client'], payload['bucket_name'], key, local_path)



def _append_job_log(job_id, message):
    timestamped = f"[{datetime.now().strftime('%H:%M:%S')}] {message}"
    append_ingestion_job_log(job_id, timestamped)



def _update_job(job_id, **fields):
    update_ingestion_job(job_id, **fields)



def _get_job_status(job_id):
    job = get_ingestion_job(job_id)
    return (job or {}).get('status', '')



def _is_job_cancellation_requested(job_id):
    return _get_job_status(job_id) in {'cancelling', 'cancelled'}



def _mark_job_cancelled(job_id, reason='任务已取消', result=None):
    payload = result or {}
    _update_job(job_id, status='cancelled', message=reason, result_json=payload)
    _append_job_log(job_id, f"[CANCELLED] {reason}")


def _build_job_result(scan_result, payload, total, imported_files, skipped_files, error_files, imported_items, built_indices):
    selected_requested = len(payload.get('selected_keys') or [])
    return {
        'source_type': payload.get('source_type', 's3'),
        'scanned_objects': scan_result['returned_count'],
        'eligible_objects': total,
        'selected_requested': selected_requested,
        'selected_matched': total if selected_requested else 0,
        'imported_files': imported_files,
        'skipped_files': skipped_files,
        'error_files': error_files,
        'imported_items': imported_items,
        'built_indices': built_indices,
    }



def _run_ingestion_job(job_id, payload):
    normalized = _normalize_payload(payload)
    temp_root = os.path.join(TEMP_DIR, f'ingestion_{job_id}')
    imported_files = 0
    skipped_files = 0
    error_files = 0
    imported_items = 0
    built_indices = []
    source_session = None

    try:
        if _is_job_cancellation_requested(job_id):
            _mark_job_cancelled(job_id, '任务在启动前已取消')
            return

        _update_job(job_id, status='running', message='正在扫描来源目录...', progress_current=0, progress_total=0)
        _append_job_log(job_id, f"开始批量导入：{_describe_source(normalized)}")

        scan_result = list_source_objects(normalized)
        supported_candidates = [obj for obj in scan_result['objects'] if obj['supported']]
        selected_keys = normalized.get('selected_keys') or []
        if selected_keys:
            selected_key_set = set(selected_keys)
            supported_objects = [obj for obj in supported_candidates if obj['key'] in selected_key_set]
            missing_count = max(0, len(selected_key_set) - len(supported_objects))
            if missing_count:
                _append_job_log(job_id, f"[WARN] 有 {missing_count} 个勾选对象未出现在本次扫描结果中")
            _append_job_log(job_id, f"已启用勾选导入：请求 {len(selected_key_set)} 个对象，命中 {len(supported_objects)} 个")
        else:
            supported_objects = supported_candidates[: normalized['max_files']]

        total = len(supported_objects)
        _update_job(job_id, progress_current=0, progress_total=total, message=f'发现 {total} 个可处理文件')
        selection_message = f"扫描完成：返回 {scan_result['returned_count']} 个对象，可处理 {len(supported_candidates)} 个"
        if selected_keys:
            selection_message += f"，本次勾选导入 {total} 个"
        _append_job_log(job_id, selection_message)

        if total == 0:
            result = _build_job_result(scan_result, normalized, 0, 0, 0, 0, 0, [])
            _update_job(job_id, status='completed', message='未发现可处理文件', result_json=result)
            return

        if _is_job_cancellation_requested(job_id):
            _mark_job_cancelled(
                job_id,
                '任务在扫描完成后已取消',
                _build_job_result(scan_result, normalized, total, imported_files, skipped_files, error_files, imported_items, built_indices),
            )
            return

        source_session = _open_source_session(normalized)
        models = load_models_cached()
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        os.makedirs(temp_root, exist_ok=True)

        for index, obj in enumerate(supported_objects, start=1):
            if _is_job_cancellation_requested(job_id):
                _mark_job_cancelled(
                    job_id,
                    f'任务已在处理第 {index} 个文件前取消',
                    _build_job_result(scan_result, normalized, total, imported_files, skipped_files, error_files, imported_items, built_indices),
                )
                return

            key = obj['key']
            display_name = obj['name'] or _display_name_from_key(key)
            local_path = os.path.join(temp_root, f"{index:04d}_{display_name}")
            _update_job(job_id, progress_current=index - 1, progress_total=total, message=f'正在处理 {display_name}')
            try:
                _append_job_log(job_id, f"[DOWNLOAD] {key}")
                _download_source_object(source_session, normalized, key, local_path)
                file_hash = None
                if not normalized['overwrite_existing']:
                    try:
                        from database import calculate_file_hash
                        file_hash = calculate_file_hash(local_path)
                        if check_file_exists(file_hash):
                            skipped_files += 1
                            _append_job_log(job_id, f"[SKIP] 已存在相同文件，跳过 {display_name}")
                            continue
                    except Exception as error:
                        _append_job_log(job_id, f"[WARN] 去重检查失败，继续处理 {display_name}: {error}")

                result = process_pipeline(local_path, display_name, models, tbl_text, tbl_image, tbl_files)
                if result.get('status') == 'ok':
                    imported_files += 1
                    imported_items += int(result.get('count', 0) or 0)
                    ext = _detect_extension(display_name)
                    if ext in CONTENT_EXTS:
                        content, _ = extract_content(local_path, ext, models)
                        if content and content.strip():
                            if file_hash is None:
                                from database import calculate_file_hash
                                file_hash = calculate_file_hash(local_path)
                            extract_entities_llm(content, file_hash)
                    _append_job_log(job_id, f"[OK] {display_name} -> {result.get('msg', 'ok')}")
                elif result.get('status') == 'skipped':
                    skipped_files += 1
                    _append_job_log(job_id, f"[SKIP] {display_name} -> {result.get('msg', 'skipped')}")
                else:
                    error_files += 1
                    _append_job_log(job_id, f"[ERROR] {display_name} -> {result.get('msg', 'error')}")
            except Exception as error:
                error_files += 1
                _append_job_log(job_id, f"[ERROR] {display_name} 处理失败: {error}")
            finally:
                _update_job(job_id, progress_current=index, progress_total=total, message=f'已处理 {index}/{total} 个文件')
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception:
                        pass

        if _is_job_cancellation_requested(job_id):
            _mark_job_cancelled(
                job_id,
                '任务已在索引构建前取消',
                _build_job_result(scan_result, normalized, total, imported_files, skipped_files, error_files, imported_items, built_indices),
            )
            return

        if normalized['index_strategy'] != 'none' and (normalized['build_text_index'] or normalized['build_image_index']):
            _update_job(job_id, message='正在构建向量索引...')
            built_indices = build_vector_indices(normalized, log_callback=lambda message: _append_job_log(job_id, message))

        result = _build_job_result(
            scan_result,
            normalized,
            total,
            imported_files,
            skipped_files,
            error_files,
            imported_items,
            built_indices,
        )
        final_message = f"导入完成：成功 {imported_files}，跳过 {skipped_files}，失败 {error_files}"
        _update_job(job_id, status='completed', message=final_message, result_json=result)
        _append_job_log(job_id, f"[DONE] {final_message}")
    except Exception as error:
        traceback_text = traceback.format_exc()
        _append_job_log(job_id, f"[FATAL] {error}\n{traceback_text}")
        _update_job(job_id, status='failed', message=f'任务失败: {error}')
    finally:
        _close_source_session(source_session)
        if os.path.isdir(temp_root):
            shutil.rmtree(temp_root, ignore_errors=True)



def start_ingestion_job(payload):
    normalized = _normalize_payload(payload)
    save_workbench_settings(normalized)
    job_id = uuid.uuid4().hex[:12]
    create_ingestion_job(job_id, f"{normalized['source_type']}_batch_ingest", normalized, status='pending', message='任务已创建')
    thread = threading.Thread(target=_run_ingestion_job, args=(job_id, normalized), daemon=True)
    thread.start()
    return get_ingestion_job(job_id)



def cancel_ingestion_job(job_id):
    job = get_ingestion_job(job_id)
    if not job:
        raise ValueError('任务不存在')

    status = job.get('status')
    if status in {'completed', 'failed', 'cancelled'}:
        return job

    if status != 'cancelling':
        update_ingestion_job(job_id, status='cancelling', message='任务取消中...')
        append_ingestion_job_log(job_id, f"[{datetime.now().strftime('%H:%M:%S')}] [CANCEL] 已收到取消请求")

    return get_ingestion_job(job_id)



def list_recent_jobs(limit=20):
    return list_ingestion_jobs(limit)
