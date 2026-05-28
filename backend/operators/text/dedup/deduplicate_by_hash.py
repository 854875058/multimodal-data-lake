# -*- coding: utf-8 -*-
"""文本哈希去重算子"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict, List, Set

from backend.operators.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    is_text_file,
    parse_operator_params,
    walk_files,
)


class DeduplicateByHashOperator:
    """对文本文件按内容哈希去重，保留首次出现的文件。"""

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
        algorithm = str(params.get('algorithm', 'md5')).lower()
        if algorithm not in ('md5', 'sha256', 'sha1'):
            algorithm = 'md5'

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        seen_hashes: Set[str] = set()
        dup_count = 0

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_bytes()
                    file_hash = hashlib.new(algorithm, content).hexdigest()
                    if file_hash in seen_hashes:
                        dup_count += 1
                        logger.debug('跳过重复文件: %s (hash=%s)', file_path.name, file_hash)
                        continue
                    seen_hashes.add(file_hash)
                    output_path.write_bytes(content)
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as error:
                logger.error('处理文件失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))

        logger.info('去重完成: 保留 %d 个文件，跳过 %d 个重复文件', len(seen_hashes), dup_count)
        return results
