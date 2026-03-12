# -*- coding: utf-8 -*-
"""SQLite helpers for file registry, task stats, entities, relations and workbench jobs."""

import hashlib
import json
import logging
import sqlite3
from pathlib import Path

from config import DB_PATH

logger = logging.getLogger(__name__)


JOB_FIELD_MAP = {
    'status': 'status',
    'progress_current': 'progress_current',
    'progress_total': 'progress_total',
    'message': 'message',
    'payload_json': 'payload_json',
    'result_json': 'result_json',
    'logs': 'logs',
}


def _ensure_dir():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)



def _get_connection():
    _ensure_dir()
    return sqlite3.connect(DB_PATH, check_same_thread=False)



def _deduplicate_tuples(values):
    seen = set()
    deduplicated = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduplicated.append(value)
    return deduplicated



def _json_dumps(value):
    return json.dumps(value, ensure_ascii=False)



def _json_loads(value, default=None):
    if value in (None, ''):
        return default
    try:
        return json.loads(value)
    except Exception:
        return default



def init_db():
    conn = _get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS file_registry (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               file_hash TEXT UNIQUE NOT NULL,
               file_name TEXT,
               file_size INTEGER,
               upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS task_stats (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               user_id INTEGER,
               task_type TEXT,
               file_count INTEGER,
               success_count INTEGER,
               processing_time REAL,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS file_entities (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               file_hash TEXT NOT NULL,
               entity_name TEXT NOT NULL,
               entity_type TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS file_entity_relations (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               file_hash TEXT NOT NULL,
               source_entity TEXT NOT NULL,
               relation_type TEXT,
               target_entity TEXT NOT NULL,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS app_settings (
               setting_key TEXT PRIMARY KEY,
               setting_value TEXT,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS ingestion_jobs (
               job_id TEXT PRIMARY KEY,
               job_type TEXT NOT NULL,
               status TEXT NOT NULL,
               progress_current INTEGER DEFAULT 0,
               progress_total INTEGER DEFAULT 0,
               message TEXT,
               payload_json TEXT,
               result_json TEXT,
               logs TEXT,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_registry_hash ON file_registry(file_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_entities_hash ON file_entities(file_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_entity_relations_hash ON file_entity_relations(file_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at ON ingestion_jobs(created_at DESC)")
        conn.commit()
    finally:
        conn.close()



def calculate_file_hash(file_path):
    digest = hashlib.md5()
    with open(file_path, 'rb') as file_obj:
        for chunk in iter(lambda: file_obj.read(4096), b''):
            digest.update(chunk)
    return digest.hexdigest()



def check_file_exists(file_hash):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM file_registry WHERE file_hash=?', (file_hash,))
        return cursor.fetchone() is not None
    except Exception as error:
        logger.error(f'检查文件是否存在失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def register_file(file_hash, file_name, file_size):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT OR REPLACE INTO file_registry (file_hash, file_name, file_size, upload_time) VALUES (?, ?, ?, COALESCE((SELECT upload_time FROM file_registry WHERE file_hash = ?), CURRENT_TIMESTAMP))',
            (file_hash, file_name, file_size, file_hash),
        )
        conn.commit()
        return True
    except Exception as error:
        logger.warning(f'注册文件失败（可能已存在）: {error}')
        return False
    finally:
        if conn:
            conn.close()



def get_file_registry_count():
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        return conn.execute('SELECT COUNT(*) FROM file_registry').fetchone()[0]
    except Exception as error:
        logger.error(f'获取文件注册数量失败: {error}')
        return 0
    finally:
        if conn:
            conn.close()



def get_task_stats(limit=50):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            'SELECT id, user_id, task_type, file_count, success_count, processing_time, created_at '
            'FROM task_stats ORDER BY id DESC LIMIT ?',
            (limit,),
        ).fetchall()
        return rows
    except Exception as error:
        logger.error(f'获取任务统计失败: {error}')
        return []
    finally:
        if conn:
            conn.close()



def delete_file_from_registry(file_hash):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM file_registry WHERE file_hash=?', (file_hash,))
        cursor.execute('DELETE FROM file_entities WHERE file_hash=?', (file_hash,))
        cursor.execute('DELETE FROM file_entity_relations WHERE file_hash=?', (file_hash,))
        conn.commit()
        return True
    except Exception as error:
        logger.error(f'删除文件注册记录失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def get_file_entities(file_hash=None):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        if file_hash:
            rows = conn.execute(
                'SELECT file_hash, entity_name, entity_type FROM file_entities WHERE file_hash=?',
                (file_hash,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT file_hash, entity_name, entity_type FROM file_entities ORDER BY id ASC'
            ).fetchall()
        return [
            {'file_hash': row[0], 'entity_name': row[1], 'entity_type': row[2]}
            for row in rows
        ]
    except Exception as error:
        logger.error(f'获取实体数据失败: {error}')
        return []
    finally:
        if conn:
            conn.close()



def get_file_entity_relations(file_hash=None):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        if file_hash:
            rows = conn.execute(
                'SELECT file_hash, source_entity, relation_type, target_entity '
                'FROM file_entity_relations WHERE file_hash=? ORDER BY id ASC',
                (file_hash,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT file_hash, source_entity, relation_type, target_entity '
                'FROM file_entity_relations ORDER BY id ASC'
            ).fetchall()
        return [
            {
                'file_hash': row[0],
                'source_entity': row[1],
                'relation_type': row[2],
                'target_entity': row[3],
            }
            for row in rows
        ]
    except Exception as error:
        logger.error(f'获取实体关系数据失败: {error}')
        return []
    finally:
        if conn:
            conn.close()



def insert_file_entities(file_hash, entities):
    conn = None
    try:
        normalized_entities = _deduplicate_tuples([
            (file_hash, name, entity_type)
            for name, entity_type in entities
            if name
        ])
        if not normalized_entities:
            return
        conn = sqlite3.connect(DB_PATH)
        conn.executemany(
            'INSERT INTO file_entities (file_hash, entity_name, entity_type) VALUES (?, ?, ?)',
            normalized_entities,
        )
        conn.commit()
    except Exception as error:
        logger.error(f'插入实体数据失败: {error}')
    finally:
        if conn:
            conn.close()



def replace_file_knowledge_graph(file_hash, entities, relations):
    conn = None
    try:
        entity_rows = _deduplicate_tuples([
            (file_hash, name, entity_type)
            for name, entity_type in entities
            if name
        ])
        relation_rows = _deduplicate_tuples([
            (file_hash, source, relation_type, target)
            for source, relation_type, target in relations
            if source and target and source != target
        ])

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM file_entities WHERE file_hash=?', (file_hash,))
        cursor.execute('DELETE FROM file_entity_relations WHERE file_hash=?', (file_hash,))

        if entity_rows:
            cursor.executemany(
                'INSERT INTO file_entities (file_hash, entity_name, entity_type) VALUES (?, ?, ?)',
                entity_rows,
            )
        if relation_rows:
            cursor.executemany(
                'INSERT INTO file_entity_relations (file_hash, source_entity, relation_type, target_entity) '
                'VALUES (?, ?, ?, ?)',
                relation_rows,
            )
        conn.commit()
    except Exception as error:
        logger.error(f'写入实体关系图谱失败: {error}')
    finally:
        if conn:
            conn.close()



def insert_task_stat(task_type, file_count, success_count, processing_time, user_id=0):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            'INSERT INTO task_stats (user_id, task_type, file_count, success_count, processing_time) '
            'VALUES (?, ?, ?, ?, ?)',
            (user_id, task_type, file_count, success_count, processing_time),
        )
        conn.commit()
    except Exception as error:
        logger.error(f'插入任务统计失败: {error}')
    finally:
        if conn:
            conn.close()



def save_app_setting(setting_key, setting_value):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            'INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) '
            'ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP',
            (setting_key, _json_dumps(setting_value)),
        )
        conn.commit()
        return True
    except Exception as error:
        logger.error(f'保存应用设置失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def get_app_setting(setting_key, default=None):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            'SELECT setting_value FROM app_settings WHERE setting_key=?',
            (setting_key,),
        ).fetchone()
        if not row:
            return default
        return _json_loads(row[0], default)
    except Exception as error:
        logger.error(f'读取应用设置失败: {error}')
        return default
    finally:
        if conn:
            conn.close()



def _row_to_job(row):
    if not row:
        return None
    return {
        'job_id': row[0],
        'job_type': row[1],
        'status': row[2],
        'progress_current': row[3],
        'progress_total': row[4],
        'message': row[5] or '',
        'payload': _json_loads(row[6], {}),
        'result': _json_loads(row[7], {}),
        'logs': row[8] or '',
        'created_at': row[9],
        'updated_at': row[10],
    }



def create_ingestion_job(job_id, job_type, payload, status='pending', message=''):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            'INSERT INTO ingestion_jobs (job_id, job_type, status, progress_current, progress_total, message, payload_json, result_json, logs, created_at, updated_at) '
            'VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            (job_id, job_type, status, message, _json_dumps(payload), _json_dumps({}), ''),
        )
        conn.commit()
        return True
    except Exception as error:
        logger.error(f'创建接入任务失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def update_ingestion_job(job_id, **fields):
    updates = []
    values = []
    for field_name, field_value in fields.items():
        column_name = JOB_FIELD_MAP.get(field_name)
        if not column_name:
            continue
        if field_name in {'payload_json', 'result_json'} and not isinstance(field_value, str):
            field_value = _json_dumps(field_value)
        updates.append(f'{column_name}=?')
        values.append(field_value)

    if not updates:
        return False

    values.extend([job_id])
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            f"UPDATE ingestion_jobs SET {', '.join(updates)}, updated_at=CURRENT_TIMESTAMP WHERE job_id=?",
            values,
        )
        conn.commit()
        return True
    except Exception as error:
        logger.error(f'更新接入任务失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def append_ingestion_job_log(job_id, message):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            'UPDATE ingestion_jobs SET logs=COALESCE(logs, \'\') || ?, updated_at=CURRENT_TIMESTAMP WHERE job_id=?',
            (f'{message}\n', job_id),
        )
        conn.commit()
        return True
    except Exception as error:
        logger.error(f'追加接入任务日志失败: {error}')
        return False
    finally:
        if conn:
            conn.close()



def get_ingestion_job(job_id):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            'SELECT job_id, job_type, status, progress_current, progress_total, message, payload_json, result_json, logs, created_at, updated_at '
            'FROM ingestion_jobs WHERE job_id=?',
            (job_id,),
        ).fetchone()
        return _row_to_job(row)
    except Exception as error:
        logger.error(f'读取接入任务失败: {error}')
        return None
    finally:
        if conn:
            conn.close()



def list_ingestion_jobs(limit=20):
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            'SELECT job_id, job_type, status, progress_current, progress_total, message, payload_json, result_json, logs, created_at, updated_at '
            'FROM ingestion_jobs ORDER BY datetime(created_at) DESC LIMIT ?',
            (limit,),
        ).fetchall()
        return [_row_to_job(row) for row in rows]
    except Exception as error:
        logger.error(f'读取接入任务列表失败: {error}')
        return []
    finally:
        if conn:
            conn.close()
