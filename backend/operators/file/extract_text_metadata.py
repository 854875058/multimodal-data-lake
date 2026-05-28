# -*- coding: utf-8 -*-
"""文本元数据提取算子"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from backend.operators.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    is_text_file,
    parse_operator_params,
    walk_files,
)


class ExtractTextMetadataOperator:
    """从文件中提取基础元数据（大小、行数、字符数、类型等），输出为 JSON。"""

    def process(
        self,
        operator_id: str,
        source_path: str,
        sink_path: str,
        param: Any,
        logger,
        config_dict: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            logger.warning('算子输入目录不可用: %s', source_path)
            return results

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        all_metadata: List[Dict[str, Any]] = []

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            try:
                stat = file_path.stat()
                meta: Dict[str, Any] = {
                    'file_name': file_path.name,
                    'relative_path': str(relative),
                    'extension': file_path.suffix.lower(),
                    'size_bytes': stat.st_size,
                    'is_text': is_text_file(str(file_path)),
                }

                if meta['is_text']:
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    lines = content.split('\n')
                    meta['line_count'] = len(lines)
                    meta['char_count'] = len(content)
                    meta['word_count'] = len(content.split())
                    meta['empty_lines'] = sum(1 for line in lines if not line.strip())

                # 写入单个文件的元数据
                meta_path = sink_root / relative.with_suffix('.meta.json')
                meta_path.parent.mkdir(parents=True, exist_ok=True)
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
                all_metadata.append(meta)

                # 非文本文件也拷贝到输出目录
                if not meta['is_text']:
                    output_path = sink_root / relative
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
                else:
                    results.append(build_process_file_info(operator_id, str(file_path), str(meta_path), 0))

            except Exception as error:
                logger.error('提取元数据失败: %s, error=%s', file_path, error, exc_info=True)

        # 写入汇总文件
        summary_path = sink_root / '_metadata_summary.json'
        summary_path.write_text(json.dumps(all_metadata, ensure_ascii=False, indent=2), encoding='utf-8')
        logger.info('元数据提取完成: 共 %d 个文件', len(all_metadata))

        return results
