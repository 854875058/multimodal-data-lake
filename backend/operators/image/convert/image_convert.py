# -*- coding: utf-8 -*-
"""图片格式转换算子"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}

class ImageConvertOperator:
    """批量转换图片格式（jpg/png/webp/bmp）。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        target_format = str(params.get('target_format', 'png')).lower().replace('.', '')
        quality = max(1, min(100, int(params.get('quality', 90))))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        try:
            from PIL import Image
        except ImportError:
            logger.error('Pillow 未安装，图片格式转换不可用')
            return results
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = (sink_root / relative).with_suffix(f'.{target_format}')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() in IMAGE_EXTENSIONS:
                    with Image.open(file_path) as img:
                        if target_format in ('jpg', 'jpeg'):
                            img = img.convert('RGB')
                            img.save(output_path, quality=quality)
                        elif target_format == 'png':
                            img.save(output_path)
                        elif target_format == 'webp':
                            img.save(output_path, quality=quality)
                        else:
                            img.save(output_path)
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('转换失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
