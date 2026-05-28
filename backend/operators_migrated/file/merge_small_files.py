# -*- coding: utf-8 -*-
"""小文件合并算子"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from backend.operators_migrated.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    is_text_file,
    parse_operator_params,
    walk_files,
)


class MergeSmallFilesOperator:
    """将小于指定大小的文本文件合并为单个文件。"""

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

        params = parse_operator_params(param)
        max_size_kb = max(1, int(params.get('max_size_kb', 10)))
        separator = str(params.get('separator', '\n---\n'))
        max_size_bytes = max_size_kb * 1024

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        small_files: List[Path] = []
        large_files: List[Path] = []

        for file_path in walk_files(source_path):
            if is_text_file(str(file_path)):
                if file_path.stat().st_size <= max_size_bytes:
                    small_files.append(file_path)
                else:
                    large_files.append(file_path)
            else:
                large_files.append(file_path)

        # 大文件直接拷贝
        for file_path in large_files:
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            copy_file(str(file_path), str(output_path))
            result_code = 2 if not is_text_file(str(file_path)) else 0
            results.append(build_process_file_info(operator_id, str(file_path), str(output_path), result_code))

        # 小文件合并
        if small_files:
            merged_path = sink_root / 'merged_output.txt'
            merged_content_parts: List[str] = []
            for file_path in sorted(small_files):
                try:
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    merged_content_parts.append(f'[{file_path.name}]\n{content}')
                except Exception as error:
                    logger.error('读取文件失败: %s, error=%s', file_path, error, exc_info=True)

            merged_path.write_text(separator.join(merged_content_parts), encoding='utf-8')
            for file_path in small_files:
                results.append(build_process_file_info(operator_id, str(file_path), str(merged_path), 0))
            logger.info('合并 %d 个小文件到 %s', len(small_files), merged_path.name)

        return results
