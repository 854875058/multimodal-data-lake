# -*- coding: utf-8 -*-
"""文本按长度切分算子"""

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


class SplitTextByLengthOperator:
    """将长文本按指定字符数切分为多段，支持重叠区间。"""

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
        chunk_size = max(50, int(params.get('chunk_size', 500)))
        overlap = max(0, int(params.get('overlap', 50)))

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    chunks = self._split_text(content, chunk_size, overlap)
                    for i, chunk in enumerate(chunks):
                        chunk_file = output_path.parent / f"{output_path.stem}_part{i:04d}{output_path.suffix}"
                        chunk_file.write_text(chunk, encoding='utf-8')
                        results.append(build_process_file_info(operator_id, str(file_path), str(chunk_file), 0))
                    logger.info('文件 %s 切分为 %d 段', file_path.name, len(chunks))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as error:
                logger.error('切分文件失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results

    @staticmethod
    def _split_text(text: str, chunk_size: int, overlap: int) -> List[str]:
        if not text:
            return []
        if len(text) <= chunk_size:
            return [text]
        chunks: List[str] = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start = end - overlap if overlap > 0 else end
        return chunks
