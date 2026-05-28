# -*- coding: utf-8 -*-
"""关键词过滤算子"""

from __future__ import annotations

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


class FilterByKeywordOperator:
    """按关键词筛选文本文件，保留或排除包含指定关键词的文件。"""

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
        keywords = params.get('keywords', [])
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(',') if k.strip()]
        mode = str(params.get('mode', 'include')).lower()
        if mode not in ('include', 'exclude'):
            mode = 'include'

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        kept = 0
        skipped = 0

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    has_keyword = any(kw.lower() in content.lower() for kw in keywords)
                    should_keep = has_keyword if mode == 'include' else not has_keyword
                    if should_keep:
                        output_path.write_text(content, encoding='utf-8')
                        results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                        kept += 1
                    else:
                        skipped += 1
                        logger.debug('过滤掉文件: %s', file_path.name)
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as error:
                logger.error('过滤文件失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))

        logger.info('关键词过滤完成: 保留 %d 个文件，过滤 %d 个文件 (模式=%s)', kept, skipped, mode)
        return results
