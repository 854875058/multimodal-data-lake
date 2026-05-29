# -*- coding: utf-8 -*-
"""图片缩放算子"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}

class ImageResizeOperator:
    """批量缩放图片尺寸。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        max_width = max(1, int(params.get('max_width', 1024)))
        max_height = max(1, int(params.get('max_height', 1024)))
        quality = max(1, min(100, int(params.get('quality', 85))))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        try:
            from PIL import Image
        except ImportError:
            logger.error('Pillow 未安装，图片缩放不可用')
            return results
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() in IMAGE_EXTENSIONS:
                    with Image.open(file_path) as img:
                        img.thumbnail((max_width, max_height), Image.LANCZOS)
                        if output_path.suffix.lower() in ('.jpg', '.jpeg'):
                            img = img.convert('RGB')
                            img.save(output_path, quality=quality)
                        else:
                            img.save(output_path)
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('缩放失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
