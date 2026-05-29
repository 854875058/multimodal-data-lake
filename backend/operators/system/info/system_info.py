# -*- coding: utf-8 -*-
"""系统信息采集算子"""
from __future__ import annotations
import json
import platform
from pathlib import Path
from typing import Any, Dict, List

class SystemInfoOperator:
    """采集系统信息：操作系统、CPU、内存、磁盘、Python 版本等。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        import shutil
        info = {
            'os': platform.system(),
            'os_version': platform.version(),
            'architecture': platform.machine(),
            'python_version': platform.python_version(),
            'hostname': platform.node(),
            'cpu_count': None,
            'memory_total_gb': None,
            'disk_total_gb': None,
            'disk_used_gb': None,
            'disk_free_gb': None,
        }
        try:
            import os
            info['cpu_count'] = os.cpu_count()
        except Exception:
            pass
        try:
            import psutil
            mem = psutil.virtual_memory()
            info['memory_total_gb'] = round(mem.total / (1024**3), 2)
            disk = psutil.disk_usage('/')
            info['disk_total_gb'] = round(disk.total / (1024**3), 2)
            info['disk_used_gb'] = round(disk.used / (1024**3), 2)
            info['disk_free_gb'] = round(disk.free / (1024**3), 2)
        except ImportError:
            pass
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        report_path = sink_root / '_system_info.json'
        report_path.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
        logger.info('系统信息采集完成')
        return [{'file': '_system_info.json', 'action': 'created'}]
